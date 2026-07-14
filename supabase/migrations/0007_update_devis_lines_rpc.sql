-- THERMIK SAAS — Étape 3 : RPC de sauvegarde atomique des lignes d'un
-- devis brouillon. Appelée directement par le client authenticated
-- normal (pas via une Edge Function) : contrairement à
-- create_devis_with_lines (Étape 2), pas de security definer et pas de
-- restriction à service_role — les policies RLS déjà en place
-- (devis_all, devis_lines_all) suffisent à garantir qu'on ne modifie que
-- les devis de sa propre entreprise. Le contrôle "v_statut <> 'brouillon'"
-- ci-dessous est une défense en profondeur en plus du blocage déjà fait
-- côté UI, pas un mécanisme de sécurité multi-tenant.

create or replace function public.update_devis_lines(p_devis_id uuid, p_lines jsonb)
returns void
language plpgsql
as $$
declare
  v_statut text;
  v_montant_ht numeric;
  v_line jsonb;
  v_ordre int := 0;
begin
  select statut into v_statut from public.devis where id = p_devis_id;

  if v_statut is null then
    raise exception 'Devis introuvable.';
  end if;

  if v_statut <> 'brouillon' then
    raise exception 'Seul un devis en brouillon peut être modifié.';
  end if;

  delete from public.devis_lines where devis_id = p_devis_id;

  select coalesce(sum((line->>'montant_ligne')::numeric), 0)
  into v_montant_ht
  from jsonb_array_elements(p_lines) as line;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.devis_lines (
      devis_id, description, quantite, unite, prix_unitaire, montant_ligne, ordre
    ) values (
      p_devis_id,
      v_line->>'description',
      (v_line->>'quantite')::numeric,
      v_line->>'unite',
      (v_line->>'prix_unitaire')::numeric,
      (v_line->>'montant_ligne')::numeric,
      v_ordre
    );
    v_ordre := v_ordre + 1;
  end loop;

  update public.devis set montant_ht = v_montant_ht, updated_at = now() where id = p_devis_id;
end;
$$;

revoke execute on function public.update_devis_lines(uuid, jsonb) from public, anon;
grant execute on function public.update_devis_lines(uuid, jsonb) to authenticated;

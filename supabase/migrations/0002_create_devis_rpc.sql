-- THERMIK SAAS — Étape 2 : RPC de création atomique d'un devis + ses lignes
-- Appelée uniquement par l'Edge Function generate-devis via le client
-- service_role. Doit vivre dans le schéma public (et non private comme
-- current_company_id) car supabase-js .rpc() passe par PostgREST, qui
-- n'expose que le schéma public.

create or replace function public.create_devis_with_lines(
  p_company_id uuid,
  p_client_id uuid,
  p_source text,
  p_transcript text,
  p_audio_path text,
  p_lines jsonb
)
returns table (devis_id uuid, numero text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next_seq int;
  v_numero text;
  v_devis_id uuid;
  v_montant_ht numeric;
  v_line jsonb;
  v_ordre int := 0;
begin
  -- Verrou scopé company_id : évite deux devis avec le même numero en
  -- cas d'appels concurrents. Libéré automatiquement à la fin de la
  -- transaction. hashtext() convertit l'uuid en clé bigint, requise par
  -- pg_advisory_xact_lock.
  perform pg_advisory_xact_lock(hashtext(p_company_id::text));

  select coalesce(max((regexp_match(numero, '-(\d+)$'))[1]::int), 0) + 1
  into v_next_seq
  from public.devis
  where company_id = p_company_id
    and numero like 'DEVIS-' || v_year || '-%';

  v_numero := 'DEVIS-' || v_year || '-' || lpad(v_next_seq::text, 4, '0');

  select coalesce(sum((line->>'montant_ligne')::numeric), 0)
  into v_montant_ht
  from jsonb_array_elements(p_lines) as line;

  insert into public.devis (
    company_id, client_id, numero, statut, montant_ht, montant_ttc,
    source, transcript_brut, audio_url
  ) values (
    p_company_id, p_client_id, v_numero, 'brouillon', v_montant_ht, null,
    p_source, p_transcript, p_audio_path
  )
  returning id into v_devis_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.devis_lines (
      devis_id, description, quantite, unite, prix_unitaire, montant_ligne, ordre
    ) values (
      v_devis_id,
      v_line->>'description',
      (v_line->>'quantite')::numeric,
      v_line->>'unite',
      (v_line->>'prix_unitaire')::numeric,
      (v_line->>'montant_ligne')::numeric,
      v_ordre
    );
    v_ordre := v_ordre + 1;
  end loop;

  return query select v_devis_id, v_numero;
end;
$$;

-- Seul service_role doit pouvoir appeler cette fonction (l'Edge Function
-- generate-devis). anon/authenticated n'y ont jamais accès directement,
-- même si elle vit dans public (nécessaire pour PostgREST/.rpc()).
revoke execute on function public.create_devis_with_lines(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_devis_with_lines(uuid, uuid, text, text, text, jsonb)
  to service_role;

-- Filet de sécurité en base en plus du verrou applicatif : garantit
-- qu'aucun doublon de numero ne peut exister par entreprise.
create unique index devis_company_numero_uidx on public.devis (company_id, numero);

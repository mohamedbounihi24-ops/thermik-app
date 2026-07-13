# Frontend React — Page Détail devis — Design

Étape 3 du plan de dev (`PLAN_DEV.md`), troisième chantier après Dashboard et Nouveau devis. Cette page permet d'éditer les lignes d'un devis brouillon et de faire progresser son statut dans le cycle de vie (`brouillon` → `envoyé` → `accepté`/`refusé`).

## Contexte

La route `/devis/:id` existe déjà dans `App.tsx` (déclarée dès le chantier Dashboard) mais n'a que le placeholder `src/pages/DetailDevis.tsx`. Le Dashboard n'a actuellement aucun lien cliquable vers cette route — ses lignes de tableau doivent devenir des liens.

## Décisions

1. **Édition des lignes limitée au statut `brouillon`** : une fois envoyé/accepté/refusé, les lignes passent en lecture seule. Pour corriger après envoi, il faut explicitement repasser le devis en `brouillon` (bouton dédié depuis `envoyé`). Évite de modifier silencieusement un devis déjà transmis au client.
2. **CRUD complet sur les lignes** (modifier/ajouter/supprimer), pas juste l'édition de valeurs existantes — l'extraction vocale GPT-4o peut mal découper les lignes, l'artisan doit pouvoir restructurer le devis avant envoi.
3. **Sauvegarde des lignes via RPC atomique**, pas plusieurs appels Supabase séparés depuis le front. Un bouton "Enregistrer les modifications" explicite envoie l'état complet des lignes en un seul appel `update_devis_lines(p_devis_id, p_lines)` qui supprime + réinsère + recalcule `montant_ht` dans une transaction — même philosophie que `create_devis_with_lines` (Étape 2) : jamais de sauvegarde partielle qui laisserait le devis incohérent.
4. **Transitions de statut avec effets de bord explicites** :
   - `brouillon` → `envoyé` : pose `date_envoi = now()`
   - `envoyé` → `accepté` ou `refusé` : pose `date_reponse = now()`
   - `envoyé` → `brouillon` : permet de corriger les lignes après envoi (pas de champ à effacer, `date_envoi` reste comme trace historique)
   - `accepté`/`refusé`/`expiré` : aucune action de statut supplémentaire depuis cette page

## Nouvelle fonction RPC

`supabase/migrations/0007_update_devis_lines_rpc.sql` :
```sql
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
```
Pas de `security definer` ni de restriction à `service_role` ici, contrairement à `create_devis_with_lines` : cette fonction est appelée directement par le client normal de l'utilisateur connecté, et les policies RLS déjà en place (`devis_all`, `devis_lines_all`) suffisent à garantir qu'on ne peut modifier que les devis de sa propre entreprise — la vérification `v_statut <> 'brouillon'` à l'intérieur est une défense en profondeur en plus du blocage déjà fait côté UI, pas un mécanisme de sécurité multi-tenant.

## Flow de la page

1. Accès via un clic sur une ligne du Dashboard (`src/pages/Dashboard.tsx` : les `<tr>` devienent des liens `react-router` vers `/devis/:id`, réutilisant `DEVIS_SELECT`/`STATUT_STYLES` déjà en place)
2. Au montage : fetch du devis (`select('*, clients(name)')`) + ses lignes (`select('*').eq('devis_id', id).order('ordre')`)
3. **En-tête** : numéro, nom du client, badge de statut (mêmes styles que le Dashboard), montant HT, dates (création/envoi/réponse si renseignées)
4. **Tableau des lignes** :
   - Si `brouillon` : champs éditables (description texte, quantité/prix unitaire numériques), `montant_ligne` recalculé en direct côté client à l'affichage (mais c'est le serveur qui fait foi au moment de l'enregistrement), bouton "Ajouter une ligne", bouton supprimer par ligne
   - Sinon : tableau en lecture seule, même présentation que le Dashboard
5. Bouton "Enregistrer les modifications" (visible seulement en `brouillon`, actif seulement si des changements sont en attente) → RPC `update_devis_lines`
6. Boutons d'action de statut selon le statut courant (voir Décisions point 4) → `supabase.from('devis').update(...)` direct (single-row, pas besoin de RPC — une seule table modifiée, déjà atomique par nature)

## Gestion d'erreurs

- Devis introuvable ou hors de sa company (RLS renvoie 0 ligne) → message explicite "Devis introuvable", pas de redirection automatique surprenante
- Échec RPC `update_devis_lines` → message d'erreur, **les modifications restent dans le formulaire** (rien n'est perdu, l'utilisateur peut réessayer)
- Échec de changement de statut → message d'erreur, le badge affiché reste l'ancien statut tant que la base n'a pas confirmé le changement

## Testing

Test de validation manuel : ouvrir un devis brouillon depuis le Dashboard, modifier une ligne, en ajouter une, en supprimer une, enregistrer, vérifier en base (`devis_lines`, `devis.montant_ht`). Marquer comme envoyé (vérifier `date_envoi`), vérifier que les lignes deviennent en lecture seule. Marquer comme accepté (vérifier `date_reponse`), vérifier badge Dashboard mis à jour via Realtime. Depuis `envoyé`, repasser en brouillon, vérifier que l'édition redevient possible.

## Hors périmètre

CRUD Clients, page Suivi relances, workflow n8n de relances (Étape 4).

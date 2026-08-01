-- THERMIK SAAS — durcissement (quick wins issus de l'audit du 15/07/2026)

-- 1. devis.updated_at n'était mis à jour que par le RPC update_devis_lines ;
--    les changements de statut (Détail devis) et toute autre écriture
--    directe le laissaient figé. Trigger moddatetime pour le maintenir
--    automatiquement sur chaque UPDATE, quelle que soit l'origine.
create extension if not exists moddatetime with schema extensions;

create trigger devis_set_updated_at
before update on public.devis
for each row
execute function extensions.moddatetime(updated_at);

-- 2. Le workflow n8n de relances (Étape 4) vérifie l'anti-doublon par
--    (cible_id, sequence) sur relances_log — seul company_id était indexé.
create index relances_log_cible_idx on public.relances_log (cible_id, sequence);

-- 3. Limite de taille à l'upload sur le bucket devis-audio : la limite de
--    25 Mo de Whisper n'était vérifiée qu'après téléchargement côté Edge
--    Function — rien n'empêchait d'uploader des fichiers énormes dans le
--    bucket. 26214400 = 25 MiB, alignée sur la limite Whisper.
update storage.buckets
set file_size_limit = 26214400
where id = 'devis-audio';

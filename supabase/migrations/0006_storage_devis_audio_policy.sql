-- THERMIK SAAS — Étape 3 : policy RLS Storage pour l'upload direct de
-- l'audio depuis le navigateur. Le bucket devis-audio est privé et n'a
-- aujourd'hui aucune policy sur storage.objects — un upload direct
-- échouerait en "permission denied" (comportement par défaut d'un
-- bucket privé sans policy explicite). INSERT seulement : la réécoute
-- avant envoi se fait depuis le Blob local (MediaRecorder), pas depuis
-- Storage, et le téléchargement serveur de generate-devis passe par
-- service_role qui bypasse RLS — pas de policy SELECT nécessaire.

create policy "devis_audio_insert_own_company" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'devis-audio'
  and (storage.foldername(name))[1] = private.current_company_id()::text
);

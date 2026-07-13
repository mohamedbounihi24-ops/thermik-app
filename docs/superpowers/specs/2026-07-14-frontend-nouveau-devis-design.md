# Frontend React — Page Nouveau devis — Design

Étape 3 du plan de dev (`PLAN_DEV.md`), deuxième chantier après le Dashboard. Cette page permet à l'artisan d'enregistrer une note vocale et de générer un devis brouillon via l'Edge Function `generate-devis` (déjà déployée et testée à l'Étape 2).

## Contexte

Le flow complet est déjà spécifié dans `CLAUDE.md` section 4.2 et dans `docs/superpowers/specs/2026-07-13-generate-devis-design.md` : le frontend enregistre l'audio, l'upload dans Storage, puis appelle l'Edge Function avec `{ audio_path, client_id }` (le `company_id` est dérivé du JWT côté serveur, jamais envoyé par le front). Cette page frontend est le premier appelant réel de ce contrat déjà construit — rien à changer côté backend, sauf un point bloquant découvert en creusant : **aucune policy RLS n'existe sur `storage.objects` pour le bucket `devis-audio`**, donc un upload direct depuis le navigateur échouerait (bucket privé, accès refusé par défaut).

## Dépendance résolue : sélection du client

La page Clients (CRUD) n'est pas encore construite — c'est un chantier séparé de l'Étape 3. Nouveau devis a besoin d'un `client_id` existant, donc cette page inclut un menu déroulant minimal qui liste les clients existants de la company (`supabase.from('clients').select()`, RLS-scopé). Pas de création de client ici. Si aucun client n'existe, message explicite invitant à en créer un (la vraie gestion CRUD viendra dans le chantier Clients).

## Migration additionnelle requise

`supabase/migrations/0006_storage_devis_audio_policy.sql` :
```sql
create policy "devis_audio_insert_own_company" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'devis-audio'
  and (storage.foldername(name))[1] = private.current_company_id()::text
);
```
Scope l'upload à un chemin commençant par le `company_id` de l'utilisateur — cohérent avec la convention de chemin déjà appliquée côté Edge Function (`audio_path.startsWith(companyId + '/')`). Pas de policy SELECT nécessaire : la réécoute avant envoi se fait depuis le `Blob` local (MediaRecorder), pas depuis Storage ; le téléchargement serveur de l'Edge Function passe par `service_role`, qui bypasse RLS.

## Flow de la page

1. **Sélection client** : menu déroulant des clients existants (RLS-scopé), obligatoire avant de pouvoir enregistrer
2. **Enregistrement audio** : `MediaRecorder` du navigateur — bouton Enregistrer/Arrêter, puis lecteur audio (`<audio controls>`) pour réécouter le blob enregistré avant envoi, avec possibilité de recommencer l'enregistrement
3. **Génération** (bouton "Générer le devis", actif seulement si client sélectionné + audio enregistré) :
   - Upload du blob vers `devis-audio/<company_id>/<uuid>.webm` via `supabase.storage.from('devis-audio').upload(...)`
   - `supabase.functions.invoke('generate-devis', { body: { audio_path, client_id } })` — le JWT de session est transmis automatiquement par le client Supabase, cohérent avec le contrat `auth: 'user'` de l'Edge Function
4. **Chargement** : état explicite pendant l'appel (peut prendre plusieurs secondes : Whisper + GPT-4o côté serveur)
5. **Succès** : redirection vers `/dashboard` — le nouveau devis apparaît via la subscription Realtime déjà en place, pas besoin de l'afficher ici puisque la page Détail devis n'a pas encore de contenu réel
6. **Erreur** (permission micro refusée, échec upload, échec Edge Function 4xx/5xx) : message explicite en français affiché sur place, rien n'est perdu — l'artisan peut réessayer sans tout ré-enregistrer

## Composants

- `src/pages/NouveauDevis.tsx` remplace le placeholder existant
- `src/hooks/useAudioRecorder.ts` : hook isolé encapsulant `MediaRecorder` (état `idle`/`recording`/`recorded`, méthodes `start()`/`stop()`/`reset()`, expose le `Blob` résultant) — séparé du composant page pour rester testable et lisible
- `src/lib/companyId.ts` ou lookup inline : la page a besoin du `company_id` de l'utilisateur courant pour construire le chemin d'upload (`supabase.from('users').select('company_id').eq('id', session.user.id).single()`, même pattern que côté Edge Function)

## Gestion d'erreurs détaillée

- Permission microphone refusée par le navigateur → message explicite, pas de crash
- Échec upload Storage → message d'erreur, le blob local reste disponible pour réessayer sans ré-enregistrer
- Édge Function renvoie une erreur (400/403/502/500, cf. spec Étape 2) → message affiché tel quel (les messages de l'Edge Function sont déjà en français et explicites)
- Aucun client disponible → message invitant à créer un client d'abord, bouton de génération désactivé

## Testing

Test de validation manuel : sélectionner un client existant, enregistrer une note vocale courte, réécouter, valider, vérifier que le devis apparaît dans le Dashboard avec les bonnes lignes extraites. Cas d'erreur à vérifier : refuser la permission micro, tenter de générer sans client sélectionné (bouton désactivé), couper la connexion pendant l'upload.

## Hors périmètre

CRUD Clients (chantier séparé), page Détail devis avec contenu réel, édition manuelle des lignes extraites avant validation (le devis reste modifiable plus tard depuis Détail devis, pas depuis cette page).

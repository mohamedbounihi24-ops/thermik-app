# Edge Function `generate-devis` — Design

Étape 2 du plan de dev (`PLAN_DEV.md`). Génère un devis à partir d'une note vocale, de façon synchrone, sans jamais exposer la clé OpenAI au frontend (règle d'or, `CLAUDE.md` section 1).

## Contexte

Le frontend enregistre l'audio et l'upload dans le bucket Storage privé `devis-audio` (créé à l'Étape 1). Il appelle ensuite cette Edge Function pour déclencher transcription + extraction + création du devis, et reçoit l'ID du devis créé en réponse directe.

## Architecture

```
Front (Étape 3, pas encore implémenté) ─┐
                                          │ POST /generate-devis
                                          │ Authorization: Bearer <JWT utilisateur>
                                          │ body: { audio_path, client_id }
                                          ▼
Edge Function generate-devis (Deno, verify_jwt=true)
  1. Extrait l'utilisateur du JWT → lookup users.company_id (service_role)
  2. Vérifie que client_id appartient bien à ce company_id
  3. Télécharge l'audio depuis Storage (service_role, bypass RLS)
  4. Vérifie la taille (≤ 25 Mo) → sinon 400 explicite
  5. Whisper (OpenAI) : transcription de l'audio
  6. GPT-4o (OpenAI, Structured Outputs) : extraction des lignes de devis
  7. RPC Postgres create_devis_with_lines() : insert devis + devis_lines
     en une transaction atomique, numero auto-généré
  8. Retourne { devis_id, numero } (200) ou une erreur explicite
```

Le frontend ne parle jamais directement à OpenAI. La clé `OPENAI_API_KEY` vit uniquement en secret Supabase (`supabase secrets set`), jamais dans le code ni committée.

## Décisions de design

Ces points n'étaient pas fixés par le PRD initial et ont été tranchés pendant le brainstorming :

1. **Déploiement** : Supabase CLI (`supabase functions new/deploy`), pas l'éditeur inline du dashboard — versionnable, testable en local avec `supabase functions serve`.

2. **Origine de `company_id`** : dérivée du JWT de l'utilisateur appelant (lookup `users.company_id` via service_role), **jamais** prise telle quelle dans le payload. Le PRD initial proposait `{ audio_url, client_id, company_id }` mais faire confiance à un `company_id` envoyé par le front reproduirait le type de faille qui a causé le bug v1 (confiance aveugle au frontend). Le payload réel est `{ audio_path, client_id }`. La fonction vérifie en plus que `client_id` appartient bien au `company_id` résolu — sinon 403.

3. **Format du fichier audio** : `audio_path` = chemin dans le bucket `devis-audio` (ex: `<company_id>/<uuid>.webm`), pas une signed URL. L'Edge Function télécharge directement via sa clé `service_role`, qui bypasse toute policy Storage — inutile de faire générer une signed URL côté front pour un aller-retour de plus.

4. **Numérotation** : compteur séquentiel par entreprise et par année, format `DEVIS-2026-0001`, généré dans la fonction RPC (voir plus bas) pour rester valable aussi pour les devis manuels du Phase 3.

5. **Montants** : `montant_ht` = somme des `montant_ligne` des lignes extraites. `montant_ttc` reste `null` — on ne devine pas de taux de TVA côté serveur (peut varier : 20% standard, 10% rénovation énergétique...). L'artisan renseigne le TTC à la main en Étape 3.

6. **Atomicité devis + devis_lines** : une fonction Postgres `create_devis_with_lines()` (`security definer`, transaction unique) reçoit le devis et ses lignes en un seul appel RPC. Élimine tout risque de devis orphelin sans lignes si l'insert échoue à mi-chemin.

7. **Taille audio** : vérifiée après téléchargement, avant l'appel Whisper (limite OpenAI : 25 Mo). Erreur 400 explicite en français si dépassée, plutôt que de laisser OpenAI renvoyer une erreur brute.

8. **Fiabilité de l'extraction JSON** : OpenAI Structured Outputs (`response_format: { type: "json_schema", strict: true }`) plutôt qu'un prompt "réponds en JSON" parsé à la main. Le schéma garantit une réponse toujours conforme — pas de `JSON.parse` qui plante sur une sortie mal formée ou du texte parasite autour du JSON.

## Composants

- **`supabase/functions/generate-devis/index.ts`** — handler HTTP Deno : auth, validation, orchestration des étapes, réponse.
- **`supabase/functions/generate-devis/openai.ts`** — deux fonctions isolées et testables indépendamment :
  - `transcribeAudio(audioBlob): Promise<string>` (appel Whisper)
  - `extractDevisLines(transcript): Promise<DevisLine[]>` (appel GPT-4o + schema strict)
- **Migration `supabase/migrations/0002_create_devis_rpc.sql`** — fonction `create_devis_with_lines(p_company_id uuid, p_client_id uuid, p_source text, p_transcript text, p_audio_path text, p_lines jsonb) returns table(devis_id uuid, numero text)` :
  - génère le `numero` séquentiel (verrouillage via `pg_advisory_xact_lock` scopé company_id pour éviter les doublons en cas d'appels concurrents)
  - insère `devis` (`statut = 'brouillon'`) puis `devis_lines` dans la même transaction
  - calcule `montant_ht` en sommant les lignes

## Payload / Réponse

**Requête** :
```json
{ "audio_path": "3f9e.../recording-1720000000.webm", "client_id": "uuid" }
```
Header `Authorization: Bearer <JWT>` obligatoire (`verify_jwt = true` dans `config.toml`).

**Réponse succès (200)** :
```json
{ "devis_id": "uuid", "numero": "DEVIS-2026-0001" }
```

**Réponses d'erreur** (toutes avec `{ "error": "message en français" }`) :
- `401` — JWT absent ou invalide
- `403` — `client_id` n'appartient pas à la company de l'utilisateur
- `400` — `audio_path` manquant, fichier introuvable dans Storage, ou fichier > 25 Mo
- `502` — échec Whisper ou GPT-4o (timeout, erreur API OpenAI)
- `500` — échec du RPC `create_devis_with_lines` (erreur DB inattendue)

## Gestion d'erreurs

Aucune écriture partielle possible : le RPC est la seule opération d'écriture en base, elle est transactionnelle (tout ou rien). Si Whisper ou GPT-4o échoue, la fonction s'arrête avant d'avoir rien écrit — pas de nettoyage à faire.

## Testing

**Test de validation du plan (Étape 2)** : appeler la fonction déployée avec `curl`, un JWT de test, et un `audio_path` pointant vers un fichier déjà présent dans `devis-audio` (uploadé manuellement au préalable via le dashboard Storage pour ce test, en attendant l'upload frontend de l'Étape 3). Vérifier ensuite dans Table Editor que `devis` (statut `brouillon`, `numero` correct) et `devis_lines` sont bien remplis.

Cas à tester manuellement :
- Audio valide → devis + lignes créés, réponse 200
- `client_id` d'une autre company → 403, rien créé
- JWT absent → 401
- Fichier audio absent du bucket → 400

## Hors périmètre de cette spec

- Upload du fichier audio depuis le front vers Storage, et les policies RLS `storage.objects` nécessaires pour l'autoriser (Étape 3 — frontend). Cette fonction suppose que le fichier existe déjà dans le bucket au moment de l'appel.
- UI d'affichage du devis généré (Étape 3).
- Édition manuelle des lignes / changement de statut (Étape 3).

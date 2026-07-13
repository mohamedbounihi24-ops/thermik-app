# THERMIK SAAS — Plan de dev Phase 1

Ce plan découle de `CLAUDE.md`. Ordre d'exécution strict : DB → Edge Function → Frontend → n8n → Déploiement. Ne pas sauter d'étape, chaque bloc doit être testé avant de passer au suivant.

---

## Étape 0 — Setup projet

- [ ] Nouveau projet Supabase (ou reset complet de l'existant si réutilisé)
- [ ] Récupérer et stocker en `.env` (jamais commit) : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Créer le repo GitHub propre (ou nettoyer `thermik-saas` existant) avec `.gitignore` incluant `.env`

## Étape 1 — Base de données (Supabase)

- [x] Créer les tables Phase 1 : `companies`, `users`, `clients`, `chantiers`, `devis`, `devis_lines`, `relances_log`, `avis_clients` (schéma exact dans `CLAUDE.md` section 3)
- [x] Créer les tables Phase 2 vides (`factures`, `contrats_entretien`) — structure seulement, pas de logique dessus
- [x] Activer RLS sur toutes les tables
- [x] Policy RLS de base : un `user` ne voit que les lignes où `company_id = current_company_id()` (fonction `private.current_company_id()`, à affiner selon le système d'auth choisi)
- [x] Créer le bucket Supabase Storage `devis-audio` (privé, accès via signed URL)
- [x] **Test de validation** : insérer une ligne test dans `devis` via l'éditeur SQL Supabase, vérifier qu'elle apparaît dans Table Editor. Supprimer après test.

## Étape 2 — Supabase Edge Function (génération devis vocal)

- [x] Créer la fonction `generate-devis` (`supabase functions new generate-devis`)
- [x] Stocker `OPENAI_API_KEY` en secret Supabase (`supabase secrets set`), jamais dans le code
- [x] Logique de la fonction (voir `docs/superpowers/specs/2026-07-13-generate-devis-design.md` pour le détail des décisions) :
  1. Reçoit `{ audio_path, client_id }` — `company_id` est dérivé du JWT de l'utilisateur appelant (jamais du payload, pour éviter de faire confiance au front)
  2. Vérifie que `client_id` appartient bien à cette company (RLS)
  3. Télécharge l'audio depuis Storage (`audio_path` = chemin dans le bucket privé `devis-audio`)
  4. Appelle Whisper (transcription)
  5. Appelle GPT-4o (Structured Outputs, schéma strict) pour extraire les lignes de devis (description, quantité, unité, prix unitaire, montant_ligne)
  6. Insert atomique (RPC `create_devis_with_lines`) dans `devis` (statut `brouillon`, `numero` séquentiel auto-généré) + `devis_lines`
  7. Retourne `{ devis_id, numero }` en réponse
- [x] **Test de validation** : appelé la fonction avec `curl` (user/company/client de test créés via l'API Admin, fichier audio de test synthétisé) ; devis + lignes apparaissent bien en base. Cas d'erreur vérifiés : 403 (client hors company), 400 (audio introuvable), 401 (JWT absent). Données de test nettoyées après coup.

## Étape 3 — Frontend React

- [x] Setup client Supabase (`@supabase/supabase-js`), variables d'env `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (voir `docs/superpowers/specs/2026-07-14-frontend-dashboard-design.md` : Vite, Tailwind v4, react-router avec les 5 routes déclarées, auth minimale)
- [x] Page **Dashboard** : `useEffect` avec fetch réel `supabase.from('devis').select('id, numero, statut, montant_ht, created_at, clients(name)')` au montage — **testé manuellement par l'utilisateur** : login, F5, changement d'onglet après création d'un devis côté serveur, déconnexion/route protégée — tout fonctionne. Le bug v1 est corrigé.
- [x] Subscription Realtime sur `devis` (`postgres_changes`, `event: '*'`) pour mise à jour live sans reload — nécessite `supabase/migrations/0005_enable_realtime_devis.sql`, confirmée fonctionnelle par le test manuel ci-dessus
- [x] Page **Nouveau devis** : sélection client (menu déroulant RLS-scopé `clients`, message explicite + bouton désactivé si aucun client), enregistrement audio via `MediaRecorder` (hook `useAudioRecorder`, état idle/recording/recorded), upload vers `devis-audio/<company_id>/<uuid>.webm`, appel `supabase.functions.invoke('generate-devis', ...)` puis redirection `/dashboard` — nécessite `supabase/migrations/0006_storage_devis_audio_policy.sql` (aucune policy RLS Storage n'existait sur le bucket, upload bloqué sans elle) — **testé manuellement par l'utilisateur** : client sélectionné, note vocale enregistrée/réécoutée/envoyée, devis apparu dans le Dashboard avec des lignes cohérentes, permission micro refusée gère l'erreur proprement
- [ ] Page **Détail devis** : édition des lignes, changement de statut (`brouillon` → `envoyé` → `accepté`/`refusé`)
- [ ] Page **Clients** : CRUD simple
- [ ] Page **Suivi relances** : lecture de `relances_log` filtrée par devis
- [x] **Test de validation** : créer un devis, changer d'onglet, revenir — le devis doit toujours être là. C'est LE test qui valide que le bug v1 est corrigé. **Validé manuellement par l'utilisateur.**

## Étape 4 — Workflows n8n (asynchrone uniquement)

- [ ] Workflow **Relances devis** : cron quotidien → query Supabase (`devis` où `statut='envoyé'` et `date_reponse IS NULL` et `date_envoi` correspond à J+3/J+7/J+14) → email Gmail HTML → insert `relances_log`
- [ ] Utiliser la `service_role_key` avec header `Authorization: Bearer <clé>` explicite dans les nodes HTTP Request Supabase (point qui avait cassé en v1)
- [ ] Workflow **Demande d'avis** : trigger sur `chantiers.statut = 'terminé'` → email avec lien avis → insert `avis_clients`
- [ ] **Test de validation** : forcer manuellement un devis à `date_envoi = aujourd'hui - 3 jours` en base, déclencher le workflow, vérifier l'email + le log

## Étape 5 — Déploiement (méthode Vikis)

- [ ] Dockerfile pour le frontend (build React → serve statique)
- [ ] Déploiement sur le VPS existant, nouveau sous-domaine (ex: `app.thermik.fr` ou équivalent)
- [ ] Variables d'environnement de prod configurées sur le VPS (jamais commit)
- [ ] Vérification finale end-to-end : créer un devis vocal en prod, vérifier persistance, vérifier qu'une relance test se déclenche bien

---

## Rappel des règles à ne pas casser en cours de route

- Frontend = lecture/écriture Supabase + appel Edge Function. Jamais d'appel direct à OpenAI depuis le navigateur.
- n8n = uniquement asynchrone (relances, avis). Pas de logique de génération devis dedans.
- RLS activée dès la création des tables, pas en rattrapage à la fin.
- Chaque étape a un test de validation à faire AVANT de passer à la suivante — ne pas enchaîner à l'aveugle.

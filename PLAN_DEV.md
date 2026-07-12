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

- [ ] Créer la fonction `generate-devis` (`supabase functions new generate-devis`)
- [ ] Stocker `OPENAI_API_KEY` en secret Supabase (`supabase secrets set`), jamais dans le code
- [ ] Logique de la fonction :
  1. Reçoit `{ audio_url, client_id, company_id }`
  2. Télécharge l'audio depuis Storage
  3. Appelle Whisper (transcription)
  4. Appelle GPT-4o avec un prompt structuré pour extraire les lignes de devis (JSON strict : description, quantité, unité, prix unitaire)
  5. Insert dans `devis` (statut `brouillon`) + `devis_lines`
  6. Retourne `{ devis_id }` en réponse
- [ ] **Test de validation** : appeler la fonction avec `curl` et un fichier audio test, vérifier que le devis + les lignes apparaissent bien en base avant de toucher au frontend

## Étape 3 — Frontend React

- [ ] Setup client Supabase (`@supabase/supabase-js`), variables d'env `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- [ ] Page **Dashboard** : `useEffect` avec fetch réel `supabase.from('devis').select()` au montage — vérifier explicitement que les données persistent après changement d'onglet (c'était le bug v1)
- [ ] Subscription Realtime sur `devis` pour mise à jour live sans reload
- [ ] Page **Nouveau devis** : enregistrement audio → upload direct vers Supabase Storage → appel de l'Edge Function `generate-devis` → affichage du résultat
- [ ] Page **Détail devis** : édition des lignes, changement de statut (`brouillon` → `envoyé` → `accepté`/`refusé`)
- [ ] Page **Clients** : CRUD simple
- [ ] Page **Suivi relances** : lecture de `relances_log` filtrée par devis
- [ ] **Test de validation** : créer un devis, changer d'onglet, revenir — le devis doit toujours être là. C'est LE test qui valide que le bug v1 est corrigé.

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

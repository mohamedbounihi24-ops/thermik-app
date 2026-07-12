# THERMIK SAAS — PRD v2 (Rebuild complet)

## 1. Contexte & Objectif

Thermik SaaS est un dashboard destiné aux PME du secteur CVC (10-20 salariés) pour automatiser leur gestion commerciale et administrative. La v1 avait un défaut critique : le frontend fonctionnait en state local React sans persistance réelle vers Supabase (un devis créé disparaissait au changement d'onglet).

**Objectif v2** : repartir sur une architecture propre où Supabase est la SEULE source de vérité, avec des workflows n8n en parallèle pour toute l'automatisation (relances, mails, transcription).

**Règle d'or de l'architecture** : le frontend ne contient JAMAIS de clé API tierce (OpenAI, etc.) en dur dans le code — ça doit toujours vivre côté serveur. Deux façons de respecter ça, selon le type de flow :

- **Flow synchrone** (l'utilisateur attend une réponse à l'écran, ex: génération devis vocal) → **Supabase Edge Function**. Le front appelle l'Edge Function, elle seule détient la clé OpenAI, elle répond directement. Rapide, un seul saut, pas de point de panne supplémentaire.
- **Flow asynchrone** (déclenché par un événement ou une horloge, personne n'attend devant l'écran — relances, emails, avis) → **n8n**. C'est fait pour l'automatisation en arrière-plan, pas pour de la réponse temps réel.

```
Flow synchrone (devis vocal) :
React Frontend ──appel direct──> Supabase Edge Function ──> OpenAI (Whisper+GPT-4o) ──> écrit dans Supabase ──> retour front

Flow asynchrone (relances, avis) :
Cron / Event Supabase ──trigger──> n8n workflow ──> Gmail / autres APIs ──> écrit dans Supabase (relances_log, avis_clients)
```

Dans les deux cas : le frontend ne parle QUE à Supabase (données) et à l'Edge Function (génération devis). Jamais d'appel front → OpenAI direct.

## 2. Stack technique

- **Frontend** : React + TypeScript + Supabase JS client (lecture temps réel via `.select()` + Realtime subscriptions, PAS de state local persistant)
- **Backend/DB** : Supabase (Postgres + Auth + Realtime + Storage pour les fichiers audio)
- **Automatisation** : n8n (cloud) — transcription, extraction, relances, emails
- **IA** : OpenAI Whisper (transcription) + GPT-4o (extraction structurée)
- **Déploiement** : Docker → VPS → sous-domaine (méthode Vikis)

## 3. Schéma de base de données complet (clean slate)

Toutes les tables sont créées dès le départ pour éviter une refonte plus tard, même si seules les tables Phase 1 sont utilisées au début. Toutes les tables métier sont scopées par `company_id` avec Row Level Security (RLS) activée — multi-tenant dès le départ.

### Tables communes (fondation — Phase 1)

```sql
companies (
  id uuid pk,
  name text,
  siret text,
  email text,
  phone text,
  address text,
  created_at timestamptz
)

users (
  id uuid pk references auth.users,
  company_id uuid references companies,
  role text, -- 'admin' | 'artisan' | 'commercial'
  created_at timestamptz
)

clients (
  id uuid pk,
  company_id uuid references companies,
  name text,
  email text,
  phone text,
  address text,
  created_at timestamptz
)

chantiers (
  id uuid pk,
  company_id uuid references companies,
  client_id uuid references clients,
  title text,
  address text,
  statut text, -- 'planifié' | 'en_cours' | 'terminé'
  date_debut date,
  date_fin date,
  created_at timestamptz
)

devis (
  id uuid pk,
  company_id uuid references companies,
  client_id uuid references clients,
  chantier_id uuid references chantiers nullable,
  numero text,
  statut text, -- 'brouillon' | 'envoyé' | 'accepté' | 'refusé' | 'expiré'
  montant_ht numeric,
  montant_ttc numeric,
  source text, -- 'vocal' | 'manuel'
  transcript_brut text nullable,
  audio_url text nullable, -- lien Supabase Storage
  date_creation timestamptz,
  date_envoi timestamptz nullable,
  date_reponse timestamptz nullable,
  created_at timestamptz,
  updated_at timestamptz
)

devis_lines (
  id uuid pk,
  devis_id uuid references devis,
  description text,
  quantite numeric,
  unite text,
  prix_unitaire numeric,
  montant_ligne numeric,
  ordre int
)

relances_log (
  id uuid pk,
  company_id uuid references companies,
  cible_type text, -- 'devis' | 'facture'
  cible_id uuid,
  sequence text, -- 'J+3' | 'J+7' | 'J+14' etc.
  canal text, -- 'email' | 'sms'
  statut_envoi text, -- 'envoyée' | 'échouée'
  date_envoi timestamptz
)

avis_clients (
  id uuid pk,
  company_id uuid references companies,
  client_id uuid references clients,
  chantier_id uuid references chantiers nullable,
  statut text, -- 'demandé' | 'reçu'
  date_demande timestamptz,
  lien_avis text
)
```

### Tables Phase 2 (créées mais pas utilisées au début)

```sql
factures (
  id uuid pk, company_id uuid, client_id uuid, devis_id uuid nullable,
  numero text, statut text, -- 'émise' | 'payée' | 'en_retard'
  montant_ttc numeric, date_emission date, date_echeance date, date_paiement date nullable,
  created_at timestamptz
)

contrats_entretien (
  id uuid pk, company_id uuid, client_id uuid,
  type_contrat text, frequence text,
  prochaine_echeance date, statut text,
  created_at timestamptz
)
```

### Tables Phase 3-4 (structure réservée, pas de code tant que non atteintes)
`prospects` (agent IA 24/7), `chantier_reports` (reporting), `planning_equipes`, `pointages`, `doe_documents`, `appels_offres_veille`.

## 4. PHASE 1 — Scope détaillé (ce qu'on code maintenant)

### 4.1 Fonctionnalités

1. **Génération de devis par note vocale** (à corriger depuis v1)
2. **Relances automatiques des devis sans réponse** (J+3, J+7, J+14)
3. **Demande d'avis client automatique** (à la clôture d'un chantier)

### 4.2 Génération devis vocal — Supabase Edge Function (remplace n8n pour ce flow)

**Bug v1 identifié** : le frontend appelait OpenAI directement en dur dans le code (clé exposée côté navigateur), et une tentative de passer par n8n avait cassé sur un souci de préfixe "Bearer" manquant sur la clé API.

**Décision v2** : ce flow est synchrone (l'artisan attend le devis à l'écran) → une Edge Function est plus adaptée qu'un aller-retour via n8n. La clé OpenAI reste côté serveur, un seul saut réseau, pas de point de panne supplémentaire.

**Flow correct** :
1. Le frontend enregistre l'audio et l'upload dans **Supabase Storage**
2. Le frontend appelle une **Edge Function** (`generate-devis`) avec l'URL du fichier Storage
3. L'Edge Function télécharge le fichier → Whisper (transcription) → GPT-4o (extraction structurée : lignes de devis, quantités, prix) → insert dans `devis` + `devis_lines` avec `statut = 'brouillon'` → renvoie l'ID du devis créé en réponse directe (pas besoin d'attendre un webhook)
4. Le front reçoit la réponse et affiche le devis immédiatement (avec Realtime en backup si jamais l'appel timeout côté front)

**Point de vigilance** : la clé OpenAI est stockée en variable d'environnement de l'Edge Function (secret Supabase), jamais dans le code du frontend ni committée sur GitHub.

### 4.3 Workflow n8n #1 — Relances devis automatiques

- **Trigger** : Cron quotidien (ex: 8h du matin)
- **Query Supabase** : `devis` où `statut = 'envoyé'` ET `date_reponse IS NULL` ET (`date_envoi` = aujourd'hui - 3j OU -7j OU -14j)
- **Action** : envoi email personnalisé (Gmail node, HTML) au client → insert dans `relances_log`
- **Séquence** : ton différent à J+3 (rappel doux), J+7 (relance ferme), J+14 (dernière relance avant expiration → `statut = 'expiré'`)

### 4.4 Workflow n8n #2 — Demande d'avis client

- **Trigger** : Supabase webhook/trigger quand `chantiers.statut` passe à `'terminé'`
- **Action** : email automatique avec lien Google Avis (ou lien générique) au client associé → insert dans `avis_clients` avec `statut = 'demandé'`

### 4.5 Pages Frontend nécessaires

- **Dashboard** : liste des devis (fetch réel Supabase au montage + Realtime subscription — PAS de state local qui vit tout seul)
- **Nouveau devis** : recorder audio → upload Storage → trigger webhook n8n → affichage du résultat via Realtime
- **Détail devis** : édition manuelle des lignes, changement de statut (brouillon → envoyé → accepté/refusé)
- **Clients** : CRUD simple
- **Suivi relances** : vue des relances envoyées par devis (lecture de `relances_log`)

### 4.6 Critères d'acceptation Phase 1

- [ ] Un devis créé reste visible après changement d'onglet / refresh de la page
- [ ] Le frontend ne contient AUCUNE clé API OpenAI en dur (ni appel direct depuis le navigateur)
- [ ] Un devis vocal passe par Storage → Edge Function → Supabase, jamais par un appel front direct à OpenAI
- [ ] Les relances partent automatiquement sans action manuelle
- [ ] Un devis "accepté" avant sa relance J+7 ne reçoit pas la relance (vérifier `date_reponse`)

## 5. Pièges techniques déjà identifiés (à respecter dès le départ)

- Qualifier les colonnes ambiguës en SQL (`documents.embedding`, etc. si RAG réintroduit plus tard)
- Utiliser la **service_role key** (pas les credentials Postgres) pour les nodes Supabase API dans n8n
- RLS activé sur toutes les tables dès la création, policies scopées par `company_id`
- Gmail : activer le type HTML + tags HTML dans le prompt système pour éviter les emails en mur de texte
- Monitorer les executions n8n par fichier dans l'onglet Executions (le trigger se déclenche par événement, pas en batch)

## 6. Prochaine étape (méthode Vikis)

Une fois ce PRD validé, génération du plan de dev détaillé via Claude Opus, puis :
1. Setup Supabase (tables + RLS + Storage bucket audio)
2. Fix/recréation des workflows n8n (génération devis, relances, avis)
3. Frontend React branché en lecture/écriture réelle
4. Déploiement Docker → VPS → sous-domaine

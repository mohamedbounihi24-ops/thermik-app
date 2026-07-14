# Workflow n8n — Relances devis automatiques (Étape 4, Workflow #1)

Référence pour la construction manuelle du workflow dans l'interface n8n. Correspond à `CLAUDE.md` section 4.3 et `PLAN_DEV.md` Étape 4.

## Rappel du piège v1

Le bug identifié dans `CLAUDE.md`/`PLAN_DEV.md` : les nodes HTTP Request vers Supabase avaient cassé sur un préfixe `Bearer` manquant. **Chaque header `Authorization` doit contenir littéralement `Bearer <clé>`, pas juste la clé.** Utiliser la `service_role key` (jamais les credentials Postgres), et ne jamais la coller en dur dans un node — la référencer via une variable d'environnement n8n (`{{$env.SUPABASE_SERVICE_ROLE_KEY}}`, à définir au niveau de l'instance n8n, pas dans le workflow).

## Décision : anti-doublon

Avant chaque envoi, le workflow vérifie qu'aucune ligne `relances_log` n'existe déjà pour ce devis + cette séquence aujourd'hui. Si le workflow est redéclenché deux fois le même jour (relance manuelle, redémarrage n8n), ça évite d'envoyer un deuxième email identique au client.

## Architecture générale

Un seul **Schedule Trigger** (cron quotidien, 08:00, fuseau horaire de l'instance n8n réglé sur `Europe/Paris` dans les settings du workflow) déclenche **trois branches parallèles indépendantes** — une par séquence (J+3, J+7, J+14). Branches séparées plutôt qu'une requête unique avec un `OR` complexe : chaque séquence a un ton d'email différent et la branche J+14 a une action supplémentaire (expiration du devis), donc autant que chaque branche soit lisible et exécutable indépendamment dans l'onglet Executions.

Les trois branches sont structurellement identiques ; seuls trois paramètres changent : le nombre de jours (3/7/14), le texte de l'email, et une étape finale propre à J+14.

## Structure détaillée d'une branche (exemple : J+3)

### 1. Set — "Fenêtre J+3"
Node **Edit Fields (Set)**, deux champs calculés :
- `window_start` = `{{$now.minus({days: 3}).startOf('day').toISO()}}`
- `window_end` = `{{$now.minus({days: 3}).endOf('day').toISO()}}`

(Pour J+7 : `minus({days: 7})`. Pour J+14 : `minus({days: 14})`.)

### 2. HTTP Request — "Devis à relancer J+3"
- **Méthode** : GET
- **URL** : `https://<project-ref>.supabase.co/rest/v1/devis`
- **Query Parameters** :
  - `select` = `id,numero,montant_ht,client_id,company_id,clients(name,email),companies(name,phone,email)`
  - `statut` = `eq.envoyé`
  - `date_reponse` = `is.null`
  - `date_envoi` = `gte.{{$json.window_start}}`
  - `date_envoi` = `lt.{{$json.window_end}}` *(deux paramètres `date_envoi` distincts — PostgREST les combine en ET)*
- **Headers** :
  - `apikey` = `{{$env.SUPABASE_SERVICE_ROLE_KEY}}`
  - `Authorization` = `Bearer {{$env.SUPABASE_SERVICE_ROLE_KEY}}` *(le préfixe "Bearer " doit être tapé explicitement dans le champ)*

C'est **la requête exacte** demandée : elle sélectionne tous les devis, toutes entreprises confondues (le workflow tourne pour l'ensemble du SaaS, pas une company en particulier), avec `statut = 'envoyé'`, `date_reponse IS NULL`, et `date_envoi` tombant dans la journée calendaire d'il y a exactement 3 jours.

### 3. Split Out (Item Lists) — "Un item par devis"
Transforme le tableau de réponse en items n8n séparés, un par devis, pour que les nodes suivants traitent chaque devis individuellement (email personnalisé, log individuel).

### 4. HTTP Request — "Relance déjà envoyée aujourd'hui ?"
- GET `https://<project-ref>.supabase.co/rest/v1/relances_log`
- Query params :
  - `select` = `id`
  - `cible_type` = `eq.devis`
  - `cible_id` = `eq.{{$json.id}}`
  - `sequence` = `eq.J+3`
  - `date_envoi` = `gte.{{$now.startOf('day').toISO()}}`
- Mêmes headers `apikey`/`Authorization` que ci-dessus

### 5. If — "Pas encore relancé"
Condition : la réponse du node précédent est un tableau vide (`{{$json.length}} === 0`). Branche `true` seulement continue vers l'envoi ; branche `false` s'arrête là (rien à faire, relance déjà loggée aujourd'hui).

### 6. Gmail — "Envoyer relance J+3"
- **To** : `{{$('Devis à relancer J+3').item.json.clients.email}}`
- **Subject** : `Rappel — votre devis {{ $('Devis à relancer J+3').item.json.numero }}`
- **Email Type** : HTML (impératif — sinon mur de texte, cf. piège déjà identifié dans `CLAUDE.md` section 5)
- **Message** (ton "rappel doux") :
  ```html
  <p>Bonjour,</p>
  <p>Nous n'avons pas encore reçu votre réponse concernant le devis
  <strong>{{numero}}</strong> ({{montant_ht}} € HT) que nous vous avons
  transmis.</p>
  <p>N'hésitez pas à nous contacter pour toute question — nous restons
  à votre disposition.</p>
  <p>Cordialement,<br>{{companies.name}}<br>{{companies.phone}}</p>
  ```
- Activer **Continue On Fail** sur ce node (pour que l'échec d'un envoi n'interrompe pas le traitement des autres devis de la boucle, et pour pouvoir logger `statut_envoi = 'échouée'` au node suivant plutôt que de planter le workflow)

### 7. HTTP Request — "Logger la relance J+3"
- POST `https://<project-ref>.supabase.co/rest/v1/relances_log`
- Headers : mêmes `apikey`/`Authorization`, plus `Content-Type: application/json`
- Body JSON :
  ```json
  {
    "company_id": "{{ $('Devis à relancer J+3').item.json.company_id }}",
    "cible_type": "devis",
    "cible_id": "{{ $('Devis à relancer J+3').item.json.id }}",
    "sequence": "J+3",
    "canal": "email",
    "statut_envoi": "{{ $node['Envoyer relance J+3'].error ? 'échouée' : 'envoyée' }}"
  }
  ```
  (adapter l'expression d'accès à l'erreur selon la version n8n — objectif : refléter fidèlement si le Gmail node a échoué)

## Branche J+7

Identique, avec :
- `minus({days: 7})` dans le Set initial
- `sequence = 'J+7'` partout
- Ton "relance ferme" : `<p>Votre devis {{numero}} est toujours en attente de réponse depuis 7 jours. Merci de nous faire part de votre décision rapidement.</p>`

## Branche J+14

Identique à J+3/J+7, avec :
- `minus({days: 14})` dans le Set initial
- `sequence = 'J+14'` partout
- Ton "dernière relance" : `<p>Sans réponse de votre part, ce devis ({{numero}}) sera considéré comme expiré. C'est notre dernière relance avant clôture.</p>`
- **Étape supplémentaire après le node de log** :

### 8. HTTP Request — "Marquer le devis comme expiré"
- PATCH `https://<project-ref>.supabase.co/rest/v1/devis?id=eq.{{ $('Devis à relancer J+14').item.json.id }}`
- Headers : `apikey`/`Authorization` habituels + `Content-Type: application/json`
- Body : `{"statut": "expiré"}`

Exécutée après la tentative de relance (que l'email ait réussi ou échoué) — le fait d'atteindre J+14 sans réponse est ce qui déclenche l'expiration, pas le succès de l'envoi lui-même.

## Test de validation (repris de `PLAN_DEV.md`)

1. Dans Table Editor Supabase, forcer un devis existant en `statut = 'envoyé'`, `date_reponse = null`, `date_envoi = now() - interval '3 days'`
2. Exécuter le workflow manuellement dans n8n (bouton "Execute Workflow")
3. Vérifier dans l'onglet Executions que la branche J+3 a bien trouvé ce devis, envoyé l'email (vérifier la boîte mail du client de test), et inséré une ligne dans `relances_log`
4. Relancer le workflow une deuxième fois immédiatement → vérifier qu'aucun deuxième email n'est envoyé (anti-doublon) et qu'aucune deuxième ligne `relances_log` n'est créée
5. Répéter pour J+7 et J+14 (dates différentes), et vérifier pour J+14 que `devis.statut` passe bien à `expiré`

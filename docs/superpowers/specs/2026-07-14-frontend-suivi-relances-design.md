# Frontend React — Page Suivi relances — Design

Étape 3 du plan de dev (`PLAN_DEV.md`), cinquième et dernier chantier de l'Étape 3. Lecture seule de `relances_log`. La table sera vide tant que le workflow n8n de relances (Étape 4) n'existe pas — ce chantier construit la page d'affichage en avance, elle se remplira d'elle-même une fois l'Étape 4 en place (aucune modification de cette page ne sera nécessaire à ce moment-là).

## Contexte

`relances_log` (`supabase/migrations/0001_init_schema.sql`) a déjà une policy RLS `relances_log_all` (`for all to authenticated`, scopée `company_id`) — aucune nouvelle migration ni policy nécessaire, comme pour Clients.

## Décision : résolution de `cible_id`

`relances_log.cible_id` n'est **pas** une vraie clé étrangère en base — c'est un uuid générique qui référence soit un `devis` soit une `facture` selon `cible_type` (Phase 1 : toujours `'devis'` en pratique, `factures` étant Phase 2 et vide). PostgREST ne peut donc pas faire de jointure automatique comme `clients(name)` ailleurs dans l'app.

Résolution choisie : deux requêtes séparées. `relances_log` d'abord, puis un `select id, numero from devis where id in (...)` sur les `cible_id` distincts où `cible_type = 'devis'`, correspondance faite côté React (`Map<id, numero>`). Pas de RPC ni de vue SQL — deux requêtes simples suffisent pour ce volume de données.

## Flow de la page

1. Fetch `relances_log` de la company, trié par `date_envoi` décroissant
2. Fetch des devis correspondants (`cible_id` où `cible_type = 'devis'`) pour résoudre les numéros
3. Tableau unique, chronologique (pas de regroupement par devis — pas justifié tant que le volume est faible, cohérent avec le principe de ne pas construire pour un besoin hypothétique) :
   - Devis (numéro résolu, ou "—" si `cible_type = 'facture'`)
   - Séquence (`J+3`, `J+7`, `J+14`...)
   - Canal (badge simple : email/sms)
   - Statut d'envoi (badge coloré : `envoyée` vert, `échouée` rouge)
   - Date d'envoi
4. Liste vide → message explicite "Aucune relance envoyée pour le moment" plutôt qu'un tableau vide silencieux

## Gestion d'erreurs

Échec du fetch `relances_log` → message d'erreur explicite, même convention que les autres pages. Échec du fetch de résolution des numéros de devis → non bloquant, les lignes concernées affichent juste "—" au lieu du numéro (pas la peine de faire échouer toute la page pour un problème d'affichage secondaire).

## Testing

Test de validation manuel : page vide au premier accès (aucune relance en base) → message explicite. Insérer une ligne de test dans `relances_log` via SQL Editor (avec un `cible_id` pointant vers un devis existant) → recharger la page → la ligne apparaît avec le bon numéro de devis résolu, badge de statut correct.

## Hors périmètre

Le contenu réel de `relances_log` (Étape 4, workflow n8n), toute action sur cette page (relance manuelle, etc. — lecture seule uniquement comme spécifié dans le PRD).

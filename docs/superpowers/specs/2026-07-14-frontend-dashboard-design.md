# Frontend React — Dashboard (devis) — Design

Étape 3 du plan de dev (`PLAN_DEV.md`), premier chantier : la page Dashboard. Aucun scaffold frontend n'existe encore dans le repo — ce spec couvre donc aussi le socle minimal (build tool, routing, auth) nécessaire pour que le Dashboard fonctionne réellement, pas juste la page en isolation.

## Contexte : le bug v1 à corriger

`CLAUDE.md` : "la v1 avait un défaut critique : le frontend fonctionnait en state local React sans persistance réelle vers Supabase (un devis créé disparaissait au changement d'onglet)."

Le state React vivait indépendamment de Supabase : un devis créé était poussé dans un tableau en mémoire (`setState`) sans jamais être relu depuis la base au montage du composant. Changer d'onglet démontait le composant, sa mémoire disparaissait, rien ne la reconstruisait.

**Principe correctif appliqué dans tout ce design** : Supabase est la seule source de vérité, jamais un cache local géré à la main.
1. Le state local n'est peuplé que par (a) un fetch réel au montage, ou (b) un événement Realtime confirmant qu'une écriture a atteint la base — jamais par une action utilisateur qui écrit directement dans le state avant confirmation serveur.
2. Créer un devis = un insert Supabase (déjà le cas via l'Edge Function `generate-devis`), jamais un `setState` optimiste inventant une ligne.
3. Conséquence mécanique : remonter sur l'onglet Dashboard = nouveau montage du composant = nouveau fetch Supabase = les données reviennent forcément de la base.

## Décisions de stack (rien n'existait avant ce chantier)

- **Build tool** : Vite (React + TypeScript). CRA est déprécié, Next.js apporterait du SSR/routing serveur inutile ici puisque tout le backend passe déjà par Supabase/Edge Functions.
- **Styling** : Tailwind CSS.
- **Routing** : `react-router`, posé dès maintenant avec les 5 routes prévues par `PLAN_DEV.md` (Dashboard, Nouveau devis, Détail devis, Clients, Suivi relances) — les 4 dernières en placeholder "à venir" tant que leurs chantiers respectifs n'ont pas eu leur propre design/plan. Évite de retravailler la structure de nav à chaque nouvelle page.
- **Auth** : page Login minimale (email/mot de passe, `supabase.auth.signInWithPassword`) + route protégée. Nécessaire de toute façon : sans session authentifiée, aucune requête RLS-scopée ne peut fonctionner, donc le Dashboard ne peut littéralement pas marcher sans ça.
- **State management pour le Dashboard** : `useEffect` + `useState` simple, pas de TanStack Query ni de store global. Colle à ce que décrit `PLAN_DEV.md` littéralement ("useEffect avec fetch réel... au montage"), et une seule liste ne justifie pas une dépendance de cache supplémentaire (YAGNI — à reconsidérer si la pagination/le cache deviennent complexes sur les pages suivantes).

## Architecture des fichiers

```
package.json, vite.config.ts, tsconfig.json, tailwind config — scaffold Vite standard
src/
  lib/supabase.ts        — client Supabase unique (createClient), lit VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
  lib/auth.tsx            — AuthContext (session courante via supabase.auth.onAuthStateChange) + composant ProtectedRoute
  pages/Login.tsx         — formulaire email/mot de passe
  pages/Dashboard.tsx     — liste des devis (cœur de ce chantier)
  pages/NouveauDevis.tsx  — placeholder "à venir"
  pages/DetailDevis.tsx   — placeholder "à venir"
  pages/Clients.tsx       — placeholder "à venir"
  pages/SuiviRelances.tsx — placeholder "à venir"
  components/Layout.tsx   — sidebar de navigation + zone de contenu (englobe les pages protégées)
  App.tsx                 — déclaration des routes react-router, ProtectedRoute autour des pages internes
  main.tsx                — point d'entrée standard Vite
```

## Variables d'environnement

`.env` (racine, déjà gitignoré) doit gagner deux clés préfixées `VITE_` — seules les variables préfixées `VITE_` sont exposées au bundle client par Vite, et exposer la clé publishable au navigateur est le comportement attendu (elle est conçue pour ça, contrairement à la secret key) :
```
VITE_SUPABASE_URL=<identique à SUPABASE_URL existant>
VITE_SUPABASE_PUBLISHABLE_KEY=<identique à SUPABASE_PUBLISHABLE_KEY existant>
```
Aucune clé secrète (`SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`) n'a sa place côté frontend, sous aucune forme — règle d'or de `CLAUDE.md` section 1, déjà respectée par construction ici puisque le Dashboard ne fait que du `select`/Realtime scopé RLS.

## Dashboard — comportement précis

1. **Montage** : `supabase.from('devis').select('id, numero, statut, montant_ht, created_at, clients(name)').order('created_at', { ascending: false })`
2. **Chargement** : état `loading` affiché pendant la requête (squelette simple, pas d'écran blanc)
3. **Erreur** : message d'erreur explicite affiché si le fetch échoue — jamais un échec silencieux
4. **Rendu** : tableau avec colonnes Numéro / Client / Statut (badge coloré par valeur : brouillon/envoyé/accepté/refusé/expiré) / Montant HT / Date de création
5. **Realtime** : subscription `postgres_changes` sur `public.devis` (`event: '*'`). RLS s'applique nativement aux événements Realtime (la subscription ne reçoit que les lignes que l'utilisateur a le droit de lire) — pas besoin de filtre `company_id` côté client.
   - `INSERT` → ajoute la ligne en tête de liste
   - `UPDATE` → remplace la ligne correspondante par id
   - `DELETE` → retire la ligne par id
6. **Cleanup** : `channel.unsubscribe()` au démontage du composant

## Migration additionnelle requise

`supabase/migrations/0005_enable_realtime_devis.sql` :
```sql
alter publication supabase_realtime add table public.devis;
```
Sans cette ligne, la table n'émet aucun événement Realtime même si RLS et le code frontend sont corrects — ce n'est pas activé par défaut à la création d'une table.

## Auth minimal

- `AuthContext` (dans `lib/auth.tsx`) expose `{ session, loading }`, alimenté par `supabase.auth.getSession()` au démarrage + `supabase.auth.onAuthStateChange` pour rester synchronisé (déconnexion dans un autre onglet, expiration de token, etc.)
- `ProtectedRoute` redirige vers `/login` si `session` est `null` une fois `loading` terminé
- Page Login : formulaire email/mot de passe → `supabase.auth.signInWithPassword` → redirection vers `/dashboard` en cas de succès, message d'erreur en français sinon

## Gestion d'erreurs

- Fetch initial échoué : message d'erreur affiché dans la zone de contenu, pas de crash de page
- Login échoué : message d'erreur sous le formulaire (traduit en français depuis le message Supabase générique)
- Aucune tentative de "récupération silencieuse" qui masquerait un vrai problème (cohérent avec la philosophie du projet : mieux vaut un échec visible qu'un état incohérent caché)

## Testing

**Test de validation du plan (Étape 3, le test qui compte)** : créer un devis (via l'Edge Function `generate-devis` déjà déployée, ou un insert SQL direct pour aller vite), le voir apparaître dans le Dashboard (soit via Realtime si déjà sur la page, soit via le fetch au montage), **changer d'onglet du navigateur puis revenir** — le devis doit toujours être là. C'est explicitement le test cité dans `PLAN_DEV.md` comme critère de résolution du bug v1.

Cas à vérifier manuellement en plus :
- Refresh complet de la page (F5) → les devis existants réapparaissent (pas seulement "changement d'onglet")
- Créer un devis pendant que le Dashboard est ouvert dans un autre onglet → il apparaît sans action manuelle (Realtime)
- Logout / accès direct à `/dashboard` sans session → redirection vers `/login`
- Erreur réseau simulée (couper la connexion) → message d'erreur visible, pas d'écran blanc

## Hors périmètre de cette spec

- Pages Nouveau devis, Détail devis, Clients, Suivi relances (placeholders seulement ici — chantiers suivants de l'Étape 3, chacun avec son propre design)
- Enregistrement audio / upload Storage (Nouveau devis)
- Édition des lignes de devis, changement de statut (Détail devis)
- Design visuel poussé (palette, composants réutilisables au-delà du strict nécessaire) — Tailwind brut suffit pour ce chantier, un système de design pourra être introduit plus tard si le nombre de pages le justifie

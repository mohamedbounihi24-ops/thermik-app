# Frontend React — Page Clients — Design

Étape 3 du plan de dev (`PLAN_DEV.md`), quatrième chantier après Dashboard, Nouveau devis et Détail devis. CRUD simple des clients, qui comble aussi un manque des chantiers précédents : Nouveau devis ne peut aujourd'hui choisir que des clients créés à la main via SQL.

## Contexte

`src/pages/Clients.tsx` est actuellement un placeholder. La table `clients` (`supabase/migrations/0001_init_schema.sql`) a déjà une policy RLS `clients_all` (`for all to authenticated`, scopée `company_id = current_company_id()`) qui couvre select/insert/update/delete — aucune nouvelle policy ni RPC nécessaire pour ce chantier.

## Décision importante : pas de suppression dans ce chantier

`chantiers`, `devis`, `avis_clients`, `factures`, `contrats_entretien` référencent tous `client_id` avec `on delete cascade`. Supprimer un client supprimerait silencieusement tout son historique de devis (et leurs lignes, par cascade supplémentaire depuis `devis`). C'est une opération destructrice à fort risque qui mérite sa propre réflexion (soft-delete ? confirmation renforcée ? blocage si devis existants ?) plutôt que d'être ajoutée rapidement dans ce chantier. Cette page ne propose donc que création et édition.

## Flow de la page

1. Fetch de la liste des clients de la company au montage (`supabase.from('clients').select('*').order('name')`), mêmes conventions loading/erreur que les autres pages
2. **Formulaire** en haut de page (toujours visible, pas de modale — cohérent avec le reste de l'app qui n'introduit ce pattern nulle part ailleurs) :
   - Champs : nom (obligatoire), email, téléphone, adresse (optionnels)
   - Mode par défaut : création (formulaire vide, bouton "Créer le client")
   - Clic sur un client dans la liste → formulaire bascule en mode édition (champs pré-remplis avec les valeurs du client sélectionné, bouton "Enregistrer les modifications", bouton "Annuler" pour revenir en mode création vide)
3. **Sauvegarde** : `supabase.from('clients').insert({...})` (création) ou `.update({...}).eq('id', ...)` (édition) — appel direct, pas de RPC nécessaire (une seule table, une seule ligne, déjà atomique par nature, contrairement aux RPC des chantiers précédents qui géraient des écritures multi-tables)
4. Après sauvegarde réussie : re-fetch de la liste depuis Supabase (jamais d'ajout optimiste en mémoire — même principe déjà appliqué partout dans l'app), formulaire repasse en mode création vide
5. **Liste** : tableau simple (nom, email, téléphone), lignes cliquables pour passer en édition (même pattern visuel que les lignes cliquables du Dashboard vers Détail devis, mais ici ça change le mode du formulaire plutôt que de naviguer vers une autre page)

## Gestion d'erreurs

- Nom vide → validation côté client avant tout appel réseau, message inline, bouton de sauvegarde désactivé
- Échec insert/update (réseau, RLS) → message d'erreur explicite, **le formulaire garde les valeurs saisies** (rien perdu, l'utilisateur peut réessayer)
- Échec du chargement initial de la liste → message d'erreur, formulaire de création reste utilisable indépendamment (créer un client ne dépend pas d'avoir pu lister les existants)

## Testing

Test de validation manuel : créer un client, le voir apparaître dans la liste, cliquer dessus, modifier un champ, sauvegarder, vérifier que la liste reflète le changement. Vérifier que ce nouveau client est bien sélectionnable dans le menu déroulant de la page Nouveau devis (qui ne montrait jusqu'ici que des clients créés à la main via SQL).

## Hors périmètre

Suppression de client (voir décision ci-dessus), page Suivi relances, tout ce qui touche `chantiers`/`factures`/`contrats_entretien` (Phase 2, hors scope Phase 1).

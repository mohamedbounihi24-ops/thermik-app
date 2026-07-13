-- THERMIK SAAS — correctif : private.current_company_id() est appelée
-- DEPUIS les policies RLS des requêtes exécutées par le rôle
-- "authenticated" (ex: users_select, clients_all...). Le révoquer pour ce
-- rôle dans 0001 cassait toute requête déclenchant ces policies
-- ("permission denied for function current_company_id"), constaté lors du
-- test de validation de l'Edge Function generate-devis. SECURITY DEFINER
-- protège déjà le contenu de la fonction (elle s'exécute avec les droits
-- du propriétaire, pas de l'appelant) ; il faut simplement autoriser
-- "authenticated" à l'invoquer.

grant execute on function private.current_company_id() to authenticated;

-- THERMIK SAAS — Étape 3 : active les événements Realtime sur devis.
-- Nécessaire pour que la subscription postgres_changes du Dashboard
-- reçoive des événements — ce n'est pas activé par défaut à la création
-- d'une table, même avec RLS et le code frontend corrects.

alter publication supabase_realtime add table public.devis;

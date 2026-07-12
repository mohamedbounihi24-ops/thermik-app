-- THERMIK SAAS — Étape 1 : schéma initial (Phase 1 + squelette Phase 2)
-- À exécuter dans l'éditeur SQL Supabase (SQL Editor > New query)

create extension if not exists pgcrypto;

-- ============================================================
-- Phase 1 — tables fondation
-- ============================================================

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  siret text,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  role text check (role in ('admin', 'artisan', 'commercial')),
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table public.chantiers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null,
  address text,
  statut text not null default 'planifié' check (statut in ('planifié', 'en_cours', 'terminé')),
  date_debut date,
  date_fin date,
  created_at timestamptz not null default now()
);

create table public.devis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  chantier_id uuid references public.chantiers (id) on delete set null,
  numero text not null,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'envoyé', 'accepté', 'refusé', 'expiré')),
  montant_ht numeric,
  montant_ttc numeric,
  source text not null check (source in ('vocal', 'manuel')),
  transcript_brut text,
  audio_url text,
  date_creation timestamptz not null default now(),
  date_envoi timestamptz,
  date_reponse timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.devis_lines (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references public.devis (id) on delete cascade,
  description text not null,
  quantite numeric,
  unite text,
  prix_unitaire numeric,
  montant_ligne numeric,
  ordre int not null default 0
);

create table public.relances_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  cible_type text not null check (cible_type in ('devis', 'facture')),
  cible_id uuid not null,
  sequence text not null,
  canal text not null check (canal in ('email', 'sms')),
  statut_envoi text not null check (statut_envoi in ('envoyée', 'échouée')),
  date_envoi timestamptz not null default now()
);

create table public.avis_clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  chantier_id uuid references public.chantiers (id) on delete set null,
  statut text not null default 'demandé' check (statut in ('demandé', 'reçu')),
  date_demande timestamptz not null default now(),
  lien_avis text
);

-- ============================================================
-- Phase 2 — tables réservées (structure seulement, pas de logique dessus)
-- ============================================================

create table public.factures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  devis_id uuid references public.devis (id) on delete set null,
  numero text not null,
  statut text not null default 'émise' check (statut in ('émise', 'payée', 'en_retard')),
  montant_ttc numeric,
  date_emission date,
  date_echeance date,
  date_paiement date,
  created_at timestamptz not null default now()
);

create table public.contrats_entretien (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  type_contrat text,
  frequence text,
  prochaine_echeance date,
  statut text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Helper RLS : résout le company_id de l'utilisateur courant
-- sans provoquer de récursion RLS sur public.users, et sans
-- réévaluer auth.uid() ligne par ligne (cf. recommandations
-- perf Supabase sur les policies).
-- Créée après les tables : elle référence public.users, qui
-- doit déjà exister.
-- ============================================================

create schema if not exists private;

create or replace function private.current_company_id()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select company_id from public.users where id = (select auth.uid())
$$;

revoke execute on function private.current_company_id() from public, anon, authenticated;

-- ============================================================
-- Index sur les clés étrangères (Postgres ne les indexe pas
-- automatiquement — nécessaire pour des JOIN/RLS rapides)
-- ============================================================

create index users_company_id_idx on public.users (company_id);
create index clients_company_id_idx on public.clients (company_id);
create index chantiers_company_id_idx on public.chantiers (company_id);
create index chantiers_client_id_idx on public.chantiers (client_id);
create index devis_company_id_idx on public.devis (company_id);
create index devis_client_id_idx on public.devis (client_id);
create index devis_chantier_id_idx on public.devis (chantier_id);
create index devis_lines_devis_id_idx on public.devis_lines (devis_id);
create index relances_log_company_id_idx on public.relances_log (company_id);
create index avis_clients_company_id_idx on public.avis_clients (company_id);
create index avis_clients_client_id_idx on public.avis_clients (client_id);
create index avis_clients_chantier_id_idx on public.avis_clients (chantier_id);
create index factures_company_id_idx on public.factures (company_id);
create index factures_client_id_idx on public.factures (client_id);
create index factures_devis_id_idx on public.factures (devis_id);
create index contrats_entretien_company_id_idx on public.contrats_entretien (company_id);
create index contrats_entretien_client_id_idx on public.contrats_entretien (client_id);

-- ============================================================
-- RLS — activée sur toutes les tables, scope company_id
-- ============================================================

alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.chantiers enable row level security;
alter table public.devis enable row level security;
alter table public.devis_lines enable row level security;
alter table public.relances_log enable row level security;
alter table public.avis_clients enable row level security;
alter table public.factures enable row level security;
alter table public.contrats_entretien enable row level security;

-- companies : lecture/écriture limitées à sa propre entreprise.
-- Pas de policy INSERT pour "authenticated" : la création d'une
-- company se fait côté backend (service_role, qui bypasse RLS),
-- pas directement par un utilisateur.
create policy companies_select on public.companies
  for select to authenticated
  using (id = (select private.current_company_id()));

create policy companies_update on public.companies
  for update to authenticated
  using (id = (select private.current_company_id()))
  with check (id = (select private.current_company_id()));

-- users : un utilisateur voit toujours sa propre ligne (bootstrap,
-- avant même d'avoir un company_id) + les collègues de sa company.
-- L'INSERT est limité à "créer sa propre ligne" (id = auth.uid()).
create policy users_select on public.users
  for select to authenticated
  using (
    id = (select auth.uid())
    or company_id = (select private.current_company_id())
  );

create policy users_insert on public.users
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy users_update on public.users
  for update to authenticated
  using (id = (select auth.uid()) or company_id = (select private.current_company_id()))
  with check (id = (select auth.uid()) or company_id = (select private.current_company_id()));

-- Tables métier standard : CRUD scopé company_id = current_company_id()
create policy clients_all on public.clients
  for all to authenticated
  using (company_id = (select private.current_company_id()))
  with check (company_id = (select private.current_company_id()));

create policy chantiers_all on public.chantiers
  for all to authenticated
  using (company_id = (select private.current_company_id()))
  with check (company_id = (select private.current_company_id()));

create policy devis_all on public.devis
  for all to authenticated
  using (company_id = (select private.current_company_id()))
  with check (company_id = (select private.current_company_id()));

-- devis_lines n'a pas de company_id propre : on passe par le devis parent
create policy devis_lines_all on public.devis_lines
  for all to authenticated
  using (
    devis_id in (
      select id from public.devis
      where company_id = (select private.current_company_id())
    )
  )
  with check (
    devis_id in (
      select id from public.devis
      where company_id = (select private.current_company_id())
    )
  );

create policy relances_log_all on public.relances_log
  for all to authenticated
  using (company_id = (select private.current_company_id()))
  with check (company_id = (select private.current_company_id()));

create policy avis_clients_all on public.avis_clients
  for all to authenticated
  using (company_id = (select private.current_company_id()))
  with check (company_id = (select private.current_company_id()));

create policy factures_all on public.factures
  for all to authenticated
  using (company_id = (select private.current_company_id()))
  with check (company_id = (select private.current_company_id()));

create policy contrats_entretien_all on public.contrats_entretien
  for all to authenticated
  using (company_id = (select private.current_company_id()))
  with check (company_id = (select private.current_company_id()));

-- Minimal Supabase platform surface for a data-free isolated PostgreSQL replay.
do $guard$ begin if current_database() <> 'jornada_migration_replay' then raise exception 'isolated replay required'; end if; end $guard$;
alter database jornada_migration_replay set jornada.replay = 'on';
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists vault;
create table auth.users (id uuid primary key);
create role "authenticated" nologin nobypassrls;
create role "anon" nologin nobypassrls;
create role "service_role" nologin bypassrls;
create role "supabase_admin" nologin bypassrls;
create role "authenticator" nologin nobypassrls;
create role "supabase_auth_admin" nologin nobypassrls;
create role "supabase_storage_admin" nologin nobypassrls;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema public to postgres;
grant usage on schema auth to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists supabase_vault with schema vault;
CREATE OR REPLACE FUNCTION auth.email()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$function$
;
CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$
;
CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$
;
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$
;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant truncate, references, trigger, maintain on tables to anon, authenticated;

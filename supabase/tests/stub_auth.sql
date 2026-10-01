-- Minimal stand-in for Supabase's auth schema and roles, so the migrations can
-- be tested on plain Postgres. Not used in production.
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;

-- Anonymous analytics for the launch gate (step 19). Events are written only
-- by the server (service role); nobody can read them through the public API.

create table public.events (
  id          bigint generated always as identity primary key,
  anon_id     uuid not null,
  session_id  uuid not null,
  name        text not null check (char_length(name) <= 40),
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index events_anon on public.events (anon_id, created_at);
create index events_name on public.events (name, created_at);

alter table public.events enable row level security;
-- No policies: anon and authenticated roles can neither read nor write.

-- Launch gate: of devices whose first session happened in the window, the
-- share that saved at least 5 words in that first session. Target: 40%.
create function public.first_session_gate(since timestamptz default now() - interval '30 days')
returns table (new_devices bigint, saved_five_plus bigint, percent numeric)
language sql
stable
set search_path = ''
as $$
  with first_sessions as (
    select distinct on (anon_id) anon_id, session_id
    from public.events
    where name = 'session_start'
    order by anon_id, created_at
  ),
  new_devices as (
    select f.anon_id, f.session_id
    from first_sessions f
    join public.events e on e.session_id = f.session_id and e.name = 'session_start'
    where e.created_at >= since
  ),
  saves as (
    select n.anon_id, count(e.id) as saved
    from new_devices n
    left join public.events e on e.session_id = n.session_id and e.name = 'word_saved'
    group by n.anon_id
  )
  select
    count(*) as new_devices,
    count(*) filter (where saved >= 5) as saved_five_plus,
    round(100.0 * count(*) filter (where saved >= 5) / nullif(count(*), 0), 1) as percent
  from saves;
$$;

revoke execute on function public.first_session_gate(timestamptz) from public, anon, authenticated;

-- More plans (Phase 3, step 30): monthly, yearly and family. A family plan
-- owner invites up to 5 people, who then get full access too.

alter table public.subscriptions
  add column plan text not null default 'monthly' check (plan in ('monthly', 'yearly', 'family'));

create table public.family_members (
  owner      uuid not null references auth.users (id) on delete cascade,
  member     uuid not null unique references auth.users (id) on delete cascade,  -- one family per person
  joined_at  timestamptz not null default now(),
  primary key (owner, member),
  check (owner <> member)
);

create table public.family_invites (
  owner       uuid primary key references auth.users (id) on delete cascade,
  code        text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  created_at  timestamptz not null default now()
);

alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;
-- Joining goes through the server (it checks the code and free seats).
create policy "see own family" on public.family_members for select to authenticated using (owner = auth.uid() or member = auth.uid());
create policy "leave or remove" on public.family_members for delete to authenticated using (owner = auth.uid() or member = auth.uid());
create policy "see own invite" on public.family_invites for select to authenticated using (owner = auth.uid());

-- Full access: your own active subscription, or a seat on an active family plan.
create function public.has_active_plan(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.subscriptions s where s.user_id = target and s.status = 'active')
      or exists (
        select 1 from public.family_members f
        join public.subscriptions s on s.user_id = f.owner
        where f.member = target and s.status = 'active' and s.plan = 'family'
      );
$$;

create or replace function public.can_play_song(target_song text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.has_active_plan(auth.uid())
    or exists (
      select 1 from public.trial_songs t
      where t.user_id = auth.uid() and t.song_id = target_song
    )
    or (select count(*) from public.trial_songs t where t.user_id = auth.uid()) < 3;
$$;

-- What the app shows in Settings: your status and plan, or the family you're in.
create function public.my_subscription()
returns table (status text, plan text, family_owner uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when public.has_active_plan(auth.uid()) then 'active' else coalesce(s.status, 'trial') end,
    case when s.status = 'active' then s.plan when f.owner is not null then 'family' else coalesce(s.plan, 'monthly') end,
    case when s.status = 'active' then null else f.owner end
  from (select auth.uid() as id) me
  left join public.subscriptions s on s.user_id = me.id
  left join public.family_members f on f.member = me.id
    and exists (select 1 from public.subscriptions o where o.user_id = f.owner and o.status = 'active' and o.plan = 'family');
$$;
revoke execute on function public.my_subscription() from public, anon;
grant execute on function public.my_subscription() to authenticated;
revoke execute on function public.has_active_plan(uuid) from public, anon, authenticated;

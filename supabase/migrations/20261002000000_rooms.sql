-- Song Rooms (Phase 2). Messages, reports and votes are written only by the
-- server (service role) after it checks age, bans, blocks, the profanity
-- filter and song-words-only mode. Learners read through row-level security,
-- which Supabase Realtime also applies to live updates.

-- Profiles: public card fields. Birth month joins birth year for the age gate.
alter table public.profiles
  add column avatar text check (char_length(avatar) <= 16),
  add column learning public.language_code[] not null default '{}',
  add column favorite_songs text[] not null default '{}' check (cardinality(favorite_songs) <= 3),
  add column birth_month integer check (birth_month between 1 and 12);

-- What other learners may see about someone (no birth date, no settings).
create view public.profile_cards
with (security_barrier)
as
  select id, display_name, avatar, speak_language, learning, favorite_songs
  from public.profiles;
grant select on public.profile_cards to authenticated;

-- Moderators and bans are managed by the server only.
create table public.moderators (
  user_id uuid primary key references auth.users (id) on delete cascade
);
create table public.bans (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  until    timestamptz not null,
  reason   text
);

create table public.follows (
  follower    uuid not null references auth.users (id) on delete cascade,
  followee    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);

create table public.blocks (
  blocker     uuid not null references auth.users (id) on delete cascade,
  blocked     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

-- One room per song. Joining a room makes you a member ("42 people are learning this song").
create table public.room_members (
  song_id    text not null references public.songs (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (song_id, user_id)
);

create table public.messages (
  id             bigint generated always as identity primary key,
  song_id        text not null references public.songs (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 300),
  mode           text not null check (mode in ('free', 'song')),
  challenge_day  date,                       -- set for daily-challenge entries
  hidden         boolean not null default false,
  created_at     timestamptz not null default now()
);
create index messages_room on public.messages (song_id, created_at desc);
create index messages_challenge on public.messages (song_id, challenge_day) where challenge_day is not null;

create table public.message_votes (
  message_id  bigint not null references public.messages (id) on delete cascade,
  voter       uuid not null references auth.users (id) on delete cascade,
  primary key (message_id, voter)
);

create table public.reports (
  id           bigint generated always as identity primary key,
  message_id   bigint not null references public.messages (id) on delete cascade,
  reporter     uuid not null references auth.users (id) on delete cascade,
  reason       text check (char_length(reason) <= 200),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolution   text check (resolution in ('restored', 'removed')),
  unique (message_id, reporter)
);

alter table public.moderators enable row level security;
alter table public.bans enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_votes enable row level security;
alter table public.reports enable row level security;
-- moderators, bans, reports: no policies — server only.

create policy "see follows" on public.follows for select to authenticated using (true);
create policy "follow as yourself" on public.follows for insert to authenticated with check (follower = auth.uid());
create policy "unfollow as yourself" on public.follows for delete to authenticated using (follower = auth.uid());

create policy "own blocks" on public.blocks for all to authenticated
  using (blocker = auth.uid()) with check (blocker = auth.uid());

create policy "see room members" on public.room_members for select to authenticated using (true);
create policy "join as yourself" on public.room_members for insert to authenticated with check (user_id = auth.uid());
create policy "leave as yourself" on public.room_members for delete to authenticated using (user_id = auth.uid());

-- Visible messages, minus anyone you blocked.
create policy "read room messages" on public.messages for select to authenticated using (
  not hidden
  and not exists (select 1 from public.blocks b where b.blocker = auth.uid() and b.blocked = messages.user_id)
);

create policy "see votes" on public.message_votes for select to authenticated using (true);

-- Realtime: stream new and changed messages to subscribers (RLS applies).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Votes stream live too, so challenge counts update for everyone.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.message_votes;
  end if;
end $$;

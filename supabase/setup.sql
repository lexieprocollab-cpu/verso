-- Verso database setup: every file in migrations/, in order, as one script.
-- For a fresh project: paste into Supabase → SQL Editor → Run. Regenerate when migrations change.
begin;

-- ===== 20260930000000_init.sql =====
-- Verso database, step 4 of the build plan.
-- Content tables (songs, lyrics, translations, glossary, quizzes) are readable
-- by everyone once a song is published and written only by the server (service
-- role). Learner tables are private: row-level security limits every row to its
-- owner.

-- Languages Verso supports, for learning and for the interface.
create domain public.language_code as text
  check (value in ('en', 'fr', 'he', 'es', 'uk', 'ru'));

------------------------------------------------------------------------------
-- Content
------------------------------------------------------------------------------

create table public.songs (
  id            text primary key check (id ~ '^[a-z0-9-]+$'),
  title         text not null,
  artist        text not null,
  language      public.language_code not null,
  speech_lang   text not null,                      -- BCP 47 tag for text-to-speech, e.g. en-US
  level         text not null check (level in ('beginner', 'intermediate', 'advanced')),
  duration_sec  numeric(8, 2) not null check (duration_sec > 0),
  audio_path    text,                               -- object in the "audio" storage bucket
  cover_path    text,
  license       text not null,                      -- e.g. CC-BY-4.0, artist-upload, original
  is_published  boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.lyric_lines (
  song_id    text not null references public.songs (id) on delete cascade,
  idx        integer not null check (idx >= 0),
  start_sec  numeric(8, 2) not null check (start_sec >= 0),
  end_sec    numeric(8, 2) not null,
  text       text not null,
  primary key (song_id, idx),
  check (end_sec > start_sec)
);

-- Per-word timing from the song timing tool (step 5). Until a line has words
-- here, the player spreads the line's time evenly across its words.
create table public.lyric_words (
  song_id    text not null,
  line_idx   integer not null,
  word_idx   integer not null check (word_idx >= 0),
  text       text not null,
  word_key   text not null,                         -- lowercase lookup key, e.g. didn't
  start_sec  numeric(8, 2) not null,
  end_sec    numeric(8, 2) not null,
  primary key (song_id, line_idx, word_idx),
  foreign key (song_id, line_idx) references public.lyric_lines (song_id, idx) on delete cascade,
  check (end_sec > start_sec)
);

create table public.line_translations (
  song_id    text not null,
  line_idx   integer not null,
  language   public.language_code not null,
  text       text not null,
  source     text not null default 'ai' check (source in ('ai', 'human')),
  reviewed   boolean not null default false,
  primary key (song_id, line_idx, language),
  foreign key (song_id, line_idx) references public.lyric_lines (song_id, idx) on delete cascade
);

-- Word meanings per song and learner language: hand-written or cached AI answers.
create table public.glossary (
  song_id      text not null references public.songs (id) on delete cascade,
  word_key     text not null,
  language     public.language_code not null,
  meaning      text not null,
  lemma        text,
  note         text,
  hebrew_root  text,
  source       text not null default 'ai' check (source in ('ai', 'human')),
  created_at   timestamptz not null default now(),
  primary key (song_id, word_key, language)
);

-- Quizzes are generated once per song, level and learner language, then reused.
create table public.quizzes (
  id                uuid primary key default gen_random_uuid(),
  song_id           text not null references public.songs (id) on delete cascade,
  level             text not null check (level in ('easy', 'medium', 'hard')),
  meaning_language  public.language_code not null,
  items             jsonb not null check (jsonb_typeof(items) = 'array'),
  created_at        timestamptz not null default now()
);
create index quizzes_lookup on public.quizzes (song_id, level, meaning_language);

------------------------------------------------------------------------------
-- Learners
------------------------------------------------------------------------------

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text check (char_length(display_name) <= 60),
  ui_language      public.language_code,
  speak_language   public.language_code,
  player_settings  jsonb not null default '{}'::jsonb,
  birth_year       integer check (birth_year between 1900 and extract(year from now())::integer),
  created_at       timestamptz not null default now()
);

create table public.saved_words (
  user_id   uuid not null references auth.users (id) on delete cascade,
  song_id   text not null references public.songs (id) on delete cascade,
  word_key  text not null,
  word      text not null,
  line_idx  integer not null,
  note      text check (char_length(note) <= 500),
  saved_at  timestamptz not null default now(),
  primary key (user_id, song_id, word_key)
);

create table public.word_reviews (
  user_id        uuid not null references auth.users (id) on delete cascade,
  song_id        text not null references public.songs (id) on delete cascade,
  word_key       text not null,
  interval_days  integer not null default 0 check (interval_days >= 0),
  ease           numeric(4, 2) not null default 2.5 check (ease >= 1.3),
  reps           integer not null default 0 check (reps >= 0),
  due_at         timestamptz not null,
  primary key (user_id, song_id, word_key)
);
create index word_reviews_due on public.word_reviews (user_id, due_at);

create table public.known_words (
  user_id   uuid not null references auth.users (id) on delete cascade,
  song_id   text not null references public.songs (id) on delete cascade,
  word_key  text not null,
  primary key (user_id, song_id, word_key)
);

create table public.quiz_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  song_id     text not null references public.songs (id) on delete cascade,
  quiz_id     uuid references public.quizzes (id) on delete set null,
  score       integer not null check (score >= 0),
  total       integer not null check (total > 0 and score <= total),
  created_at  timestamptz not null default now()
);

create table public.activity_days (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  primary key (user_id, day)
);

-- Subscription with a free trial of 3 songs (step 19). Written by the server
-- from Stripe webhooks; learners can only read their own row.
create table public.subscriptions (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  status              text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'canceled')),
  stripe_customer_id  text unique,
  current_period_end  timestamptz
);

create table public.trial_songs (
  user_id     uuid not null references auth.users (id) on delete cascade,
  song_id     text not null references public.songs (id) on delete cascade,
  started_at  timestamptz not null default now(),
  primary key (user_id, song_id)
);

-- May the current learner play this song? Subscribers: any song. Trial: the
-- songs already started, plus new ones until 3 have been started.
create function public.can_play_song(target_song text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.subscriptions s
      where s.user_id = auth.uid() and s.status = 'active'
    )
    or exists (
      select 1 from public.trial_songs t
      where t.user_id = auth.uid() and t.song_id = target_song
    )
    or (select count(*) from public.trial_songs t where t.user_id = auth.uid()) < 3;
$$;

-- Every new account gets a profile and a trial subscription row.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.subscriptions (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------
-- Row-level security
------------------------------------------------------------------------------

alter table public.songs enable row level security;
alter table public.lyric_lines enable row level security;
alter table public.lyric_words enable row level security;
alter table public.line_translations enable row level security;
alter table public.glossary enable row level security;
alter table public.quizzes enable row level security;
alter table public.profiles enable row level security;
alter table public.saved_words enable row level security;
alter table public.word_reviews enable row level security;
alter table public.known_words enable row level security;
alter table public.quiz_results enable row level security;
alter table public.activity_days enable row level security;
alter table public.subscriptions enable row level security;
alter table public.trial_songs enable row level security;

-- Published content is public.
create policy "published songs are readable" on public.songs
  for select using (is_published);
create policy "lyrics of published songs are readable" on public.lyric_lines
  for select using (exists (select 1 from public.songs s where s.id = song_id and s.is_published));
create policy "word timings of published songs are readable" on public.lyric_words
  for select using (exists (select 1 from public.songs s where s.id = song_id and s.is_published));
create policy "translations of published songs are readable" on public.line_translations
  for select using (exists (select 1 from public.songs s where s.id = song_id and s.is_published));
create policy "glossary of published songs is readable" on public.glossary
  for select using (exists (select 1 from public.songs s where s.id = song_id and s.is_published));
create policy "quizzes of published songs are readable" on public.quizzes
  for select using (exists (select 1 from public.songs s where s.id = song_id and s.is_published));

-- Learners own their rows.
create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own saved words" on public.saved_words
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own reviews" on public.word_reviews
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own known words" on public.known_words
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own quiz results" on public.quiz_results
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own activity" on public.activity_days
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read own subscription" on public.subscriptions
  for select using (user_id = auth.uid());
create policy "read own trial songs" on public.trial_songs
  for select using (user_id = auth.uid());
-- Starting a trial song is allowed only while the trial has room.
create policy "start a trial song" on public.trial_songs
  for insert with check (user_id = auth.uid() and public.can_play_song(song_id));

-- ===== 20261001000000_analytics.sql =====
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

-- ===== 20261002000000_rooms.sql =====
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

-- ===== 20261003000000_buddies.sql =====
-- Language buddies and private messages (Phase 3, step 26). Like room
-- messages, private messages are written only by the server, which checks the
-- age rule (an under-18 may message an adult only if they follow them), blocks
-- and the profanity filter. Each person reads only their own conversations.

create table public.direct_messages (
  id          bigint generated always as identity primary key,
  sender      uuid not null references auth.users (id) on delete cascade,
  recipient   uuid not null references auth.users (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 300),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  check (sender <> recipient)
);
create index direct_messages_pair on public.direct_messages (least(sender, recipient), greatest(sender, recipient), created_at desc);
create index direct_messages_recipient on public.direct_messages (recipient, created_at desc);

alter table public.direct_messages enable row level security;
create policy "read own conversations" on public.direct_messages for select to authenticated using (
  not hidden
  and (sender = auth.uid() or recipient = auth.uid())
  and not exists (
    select 1 from public.blocks b
    where b.blocker = auth.uid() and b.blocked = case when direct_messages.sender = auth.uid() then direct_messages.recipient else direct_messages.sender end
  )
);

-- Reports cover room messages and private messages: exactly one of the two.
alter table public.reports alter column message_id drop not null;
alter table public.reports add column direct_message_id bigint references public.direct_messages (id) on delete cascade;
alter table public.reports add constraint reports_one_target check ((message_id is null) <> (direct_message_id is null));
alter table public.reports add constraint reports_dm_once unique (direct_message_id, reporter);

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;

-- ===== 20261004000000_artists.sql =====
-- Artist uploads (Phase 3, step 28). Independent artists get a public profile
-- and submit songs they timed in the song timing tool. Submissions are written
-- by the server after validation and stay unpublished until a moderator
-- approves them.

create table public.artists (
  id          uuid primary key references auth.users (id) on delete cascade,
  slug        text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  name        text not null check (char_length(name) between 1 and 80),
  bio         text not null default '' check (char_length(bio) <= 1000),
  links       text[] not null default '{}' check (cardinality(links) <= 3),
  created_at  timestamptz not null default now()
);
alter table public.artists enable row level security;
create policy "artist profiles are public" on public.artists for select using (true);
-- No write policies: the server validates slugs and links.

alter table public.songs
  add column artist_id            uuid references public.artists (id) on delete set null,
  add column review_status        text not null default 'approved' check (review_status in ('pending', 'approved', 'rejected')),
  add column review_note          text check (char_length(review_note) <= 500),
  add column rights_confirmed_at  timestamptz,
  add column submitted_at         timestamptz;
create index songs_artist on public.songs (artist_id);
create index songs_review on public.songs (review_status) where review_status = 'pending';

-- Artists see their own submissions (with review status) before they're published.
create policy "artists read own songs" on public.songs
  for select to authenticated using (artist_id = auth.uid());

-- Audio for uploaded songs. Files are uploaded with a signed URL from the
-- server, under "<artist id>/<random id>.<ext>"; the bucket is public so the
-- player can stream approved songs.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('audio', 'audio', true, 20971520,
            array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/flac'])
    on conflict (id) do nothing;
  end if;
end $$;

-- ===== 20261005000000_licensing.sql =====
-- Licensed catalog (Phase 3, step 29): where a song's rights come from, and
-- official-video playback. Filled in by the team after the legal review; the
-- app only reads these fields.

alter table public.songs
  add column youtube_id          text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  add column rights_holder       text,                    -- label or publisher that granted the license
  add column lyrics_provider     text,                    -- e.g. the licensed lyrics provider the text came from
  add column license_ref         text,                    -- contract or license id, for audits
  add column territories         text[] not null default '{}'   -- ISO country codes, e.g. {US,CA}; empty means worldwide
                                   check (array_to_string(territories, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
  add column license_expires_at  timestamptz;

-- A song stops being readable the moment its license expires.
drop policy "published songs are readable" on public.songs;
create policy "published songs are readable" on public.songs
  for select using (is_published and (license_expires_at is null or license_expires_at > now()));

drop policy "lyrics of published songs are readable" on public.lyric_lines;
create policy "lyrics of published songs are readable" on public.lyric_lines
  for select using (exists (
    select 1 from public.songs s
    where s.id = song_id and s.is_published and (s.license_expires_at is null or s.license_expires_at > now())
  ));

-- ===== 20261006000000_plans.sql =====
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

-- ===== 20261007000000_more_languages.sql =====
-- More languages (Phase 3, step 32): German and Arabic, for learning and for
-- the interface. Postgres can't change a domain's check while an array column
-- uses the domain, so profiles.learning is plain text[] during the change (and
-- the view that reads it is recreated).
drop view public.profile_cards;
alter table public.profiles alter column learning drop default;
alter table public.profiles alter column learning type text[];

alter domain public.language_code drop constraint language_code_check;
alter domain public.language_code add constraint language_code_check
  check (value in ('en', 'fr', 'he', 'es', 'uk', 'ru', 'de', 'ar'));

alter table public.profiles alter column learning type public.language_code[] using learning::public.language_code[];
alter table public.profiles alter column learning set default '{}';

create view public.profile_cards
with (security_barrier)
as
  select id, display_name, avatar, speak_language, learning, favorite_songs
  from public.profiles;
grant select on public.profile_cards to authenticated;

-- ===== 20261008000000_store_subscriptions.sql =====
-- Subscriptions bought in the mobile app (App Store / Google Play, reported
-- through RevenueCat) share the subscriptions table with Stripe on the web.
alter table public.subscriptions
  add column source text not null default 'stripe' check (source in ('stripe', 'app_store', 'play_store')),
  add column store_expires_at timestamptz;

commit;

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

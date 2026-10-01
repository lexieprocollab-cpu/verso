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

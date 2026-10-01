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

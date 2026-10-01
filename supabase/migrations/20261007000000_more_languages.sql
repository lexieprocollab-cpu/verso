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

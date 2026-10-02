-- Row-level security checks. Each block raises an exception on failure.
\set ON_ERROR_STOP on

-- Two learners and two songs: one published, one draft.
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into public.songs (id, title, artist, language, speech_lang, level, duration_sec, license, is_published) values
  ('down-to-the-sea', 'Down to the Sea', 'Verso Demo', 'en', 'en-US', 'beginner', 27.5, 'original', true),
  ('draft-song', 'Draft', 'Nobody', 'fr', 'fr-FR', 'beginner', 30, 'original', false),
  ('song-3', 'Three', 'A', 'es', 'es-ES', 'beginner', 30, 'original', true),
  ('song-4', 'Four', 'B', 'he', 'he-IL', 'beginner', 30, 'original', true);
insert into public.lyric_lines values ('down-to-the-sea', 0, 1, 4.8, 'I walked my dog down to the sea');
insert into public.lyric_lines values ('draft-song', 0, 1, 4, 'Secret');

do $$ begin
  -- New users got a profile and a trial subscription from the trigger.
  assert (select count(*) from public.profiles) = 2, 'profiles created by trigger';
  assert (select count(*) from public.subscriptions where status = 'trial') = 2, 'trial rows created';
end $$;

-- Learner 1 acts through the API.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$ begin
  assert (select count(*) from public.songs) = 3, 'only published songs are visible';
  assert (select count(*) from public.lyric_lines) = 1, 'draft lyrics are hidden';
  assert (select count(*) from public.profiles) = 1, 'only own profile is visible';
end $$;

insert into public.saved_words (user_id, song_id, word_key, word, line_idx)
  values ('11111111-1111-1111-1111-111111111111', 'down-to-the-sea', 'dog', 'dog', 0);

do $$ begin
  begin
    insert into public.saved_words (user_id, song_id, word_key, word, line_idx)
      values ('22222222-2222-2222-2222-222222222222', 'down-to-the-sea', 'sea', 'sea', 0);
    raise exception 'wrote a row for another learner';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.songs (id, title, artist, language, speech_lang, level, duration_sec, license)
      values ('hack', 'x', 'x', 'en', 'en', 'beginner', 1, 'x');
    raise exception 'learner created a song';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.subscriptions set status = 'active';
    assert not exists (select 1 from public.subscriptions where status = 'active'), 'learner activated own subscription';
  end;
end $$;

-- Trial: three songs may be started, the fourth is refused.
insert into public.trial_songs (user_id, song_id) values
  ('11111111-1111-1111-1111-111111111111', 'down-to-the-sea'),
  ('11111111-1111-1111-1111-111111111111', 'song-3'),
  ('11111111-1111-1111-1111-111111111111', 'draft-song');
do $$ begin
  assert public.can_play_song('song-3'), 'a started trial song stays playable';
  assert not public.can_play_song('song-4'), 'a fourth song is locked';
  begin
    insert into public.trial_songs (user_id, song_id) values ('11111111-1111-1111-1111-111111111111', 'song-4');
    raise exception 'started a fourth trial song';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Learner 2 sees none of learner 1's words.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from public.saved_words) = 0, 'other learners'' words are hidden';
  assert public.can_play_song('song-4'), 'learner 2 still has a fresh trial';
end $$;

-- Anonymous visitors can read published content but no learner data.
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select count(*) from public.songs) = 3, 'anonymous reads published songs';
  assert (select count(*) from public.saved_words) = 0, 'anonymous sees no learner data';
end $$;

reset role;

-- Analytics: two new devices; one saves 5 words in its first session, the
-- other saves 2 now and 3 more in a later session (doesn't count).
insert into public.events (anon_id, session_id, name, created_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'session_start', now() - interval '2 days'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'session_start', now() - interval '2 days'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000003', 'session_start', now() - interval '1 day');
insert into public.events (anon_id, session_id, name)
  select 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'word_saved' from generate_series(1, 5);
insert into public.events (anon_id, session_id, name)
  select 'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'word_saved' from generate_series(1, 2);
insert into public.events (anon_id, session_id, name)
  select 'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000003', 'word_saved' from generate_series(1, 3);

do $$
declare r record;
begin
  select * into r from public.first_session_gate();
  assert r.new_devices = 2, 'two new devices';
  assert r.saved_five_plus = 1, 'one saved 5+ words in its first session';
  assert r.percent = 50.0, 'gate is 50%';
end $$;

set role anon;
do $$ begin
  assert (select count(*) from public.events) = 0, 'anonymous cannot read events';
  begin
    insert into public.events (anon_id, session_id, name) values (gen_random_uuid(), gen_random_uuid(), 'x');
    raise exception 'anonymous wrote an event directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.first_session_gate();
    raise exception 'anonymous ran the gate report';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Song Rooms. The server writes messages; learners only read.
update public.profiles set display_name = 'Ana', avatar = '🦊', birth_year = 1995, birth_month = 3
  where id = '11111111-1111-1111-1111-111111111111';
insert into public.messages (song_id, user_id, body, mode) values
  ('down-to-the-sea', '11111111-1111-1111-1111-111111111111', 'hello from Ana', 'free'),
  ('down-to-the-sea', '22222222-2222-2222-2222-222222222222', 'hello from Ben', 'song');
insert into public.messages (song_id, user_id, body, mode, hidden) values
  ('down-to-the-sea', '22222222-2222-2222-2222-222222222222', 'reported message', 'free', true);

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select display_name from public.profile_cards where id = '11111111-1111-1111-1111-111111111111') = 'Ana', 'profile cards are public to members';
  assert (select count(*) from public.messages) = 2, 'hidden messages are not visible';
  begin
    insert into public.messages (song_id, user_id, body, mode) values ('down-to-the-sea', '22222222-2222-2222-2222-222222222222', 'direct write', 'free');
    raise exception 'learner wrote a message directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.moderators values ('22222222-2222-2222-2222-222222222222');
    raise exception 'learner made themselves a moderator';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.reports) = 0, 'reports are not readable';
end $$;

insert into public.follows (follower, followee) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
insert into public.room_members (song_id, user_id) values ('down-to-the-sea', '22222222-2222-2222-2222-222222222222');
insert into public.blocks (blocker, blocked) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
do $$ begin
  assert (select count(*) from public.messages) = 1, 'messages from blocked people disappear';
  begin
    insert into public.follows (follower, followee) values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    raise exception 'followed on behalf of someone else';
  exception when insufficient_privilege then null;
  end;
  begin
    perform birth_year from public.profile_cards;
    raise exception 'birth year exposed on profile cards';
  exception when undefined_column then null;
  end;
end $$;
reset role;

-- Private messages: only the two people in a conversation read it; only the server writes.
insert into auth.users values ('33333333-3333-3333-3333-333333333333');
insert into public.direct_messages (sender, recipient, body) values
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'hi Cleo'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'hi Ana');
insert into public.direct_messages (sender, recipient, body, hidden) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'reported dm', true);
insert into public.reports (direct_message_id, reporter)
  select id, '11111111-1111-1111-1111-111111111111' from public.direct_messages where body = 'reported dm';

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  assert (select count(*) from public.direct_messages) = 2, 'both sides of own conversation, minus hidden';
  begin
    insert into public.direct_messages (sender, recipient, body) values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'direct');
    raise exception 'learner wrote a private message directly';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from public.direct_messages) = 0, 'other people''s conversations are private';
end $$;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
insert into public.blocks (blocker, blocked) values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111');
do $$ begin
  assert (select count(*) from public.direct_messages) = 0, 'blocking hides the conversation';
end $$;
reset role;
do $$ begin
  begin
    insert into public.reports (reporter) values ('11111111-1111-1111-1111-111111111111');
    raise exception 'report without a target';
  exception when check_violation then null;
  end;
end $$;
-- Artists: public profiles; submissions stay private until approved.
insert into public.artists (id, slug, name) values ('33333333-3333-3333-3333-333333333333', 'cleo', 'Cleo');
insert into public.songs (id, title, artist, language, speech_lang, level, duration_sec, license, is_published, artist_id, review_status)
  values ('cleo-song', 'Cleo Song', 'Cleo', 'fr', 'fr-FR', 'beginner', 60, 'artist-upload', false, '33333333-3333-3333-3333-333333333333', 'pending');
set role anon;
do $$ begin
  assert (select name from public.artists where slug = 'cleo') = 'Cleo', 'artist profiles are public';
  assert not exists (select 1 from public.songs where id = 'cleo-song'), 'pending submissions are hidden';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  assert (select review_status from public.songs where id = 'cleo-song') = 'pending', 'artists see their own submissions';
  begin
    update public.artists set name = 'Hacked';
    assert (select name from public.artists where slug = 'cleo') = 'Cleo', 'artists cannot write their row directly';
  end;
  begin
    insert into public.artists (id, slug, name) values ('11111111-1111-1111-1111-111111111111', 'fake', 'Fake');
    raise exception 'wrote an artist profile directly';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  assert not exists (select 1 from public.songs where id = 'cleo-song'), 'other people cannot see a pending submission';
end $$;
reset role;
-- Licensing: an expired license hides the song and its lyrics.
update public.songs set license_expires_at = now() - interval '1 day', youtube_id = 'dQw4w9WgXcQ' where id = 'song-3';
insert into public.lyric_lines values ('song-3', 0, 1, 3, 'Hola');
set role anon;
do $$ begin
  assert not exists (select 1 from public.songs where id = 'song-3'), 'expired license hides the song';
  assert not exists (select 1 from public.lyric_lines where song_id = 'song-3'), 'expired license hides the lyrics';
  assert exists (select 1 from public.songs where id = 'down-to-the-sea'), 'other songs stay';
end $$;
reset role;
do $$ begin
  begin
    update public.songs set youtube_id = 'not a video id' where id = 'song-4';
    raise exception 'accepted a bad YouTube id';
  exception when check_violation then null;
  end;
  begin
    update public.songs set territories = '{us}' where id = 'song-4';
    raise exception 'accepted a bad country code';
  exception when check_violation then null;
  end;
  update public.songs set territories = '{US,CA}' where id = 'song-4';
end $$;
-- Family plans: learner 3 owns a family plan and adds learner 2.
update public.subscriptions set status = 'active', plan = 'family' where user_id = '33333333-3333-3333-3333-333333333333';
insert into public.family_members (owner, member) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222');
insert into public.family_invites (owner, code) values ('33333333-3333-3333-3333-333333333333', 'ABCD2345');
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$
declare r record;
begin
  select * into r from public.my_subscription();
  assert r.status = 'active' and r.plan = 'family' and r.family_owner = '33333333-3333-3333-3333-333333333333', 'family member has access';
  assert public.can_play_song('song-4'), 'family member plays any song';
  assert (select count(*) from public.family_invites) = 0, 'members cannot read the invite code';
  begin
    insert into public.family_members (owner, member) values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111');
    raise exception 'added someone to a family directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.has_active_plan('33333333-3333-3333-3333-333333333333');
    raise exception 'learners can probe other people''s plans';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- The owner switches to a yearly plan: family seats stop counting.
update public.subscriptions set plan = 'yearly' where user_id = '33333333-3333-3333-3333-333333333333';
set role authenticated;
do $$
declare r record;
begin
  select * into r from public.my_subscription();
  assert r.status = 'trial' and r.family_owner is null, 'seat ends when the family plan ends';
end $$;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$
declare r record;
begin
  select * into r from public.my_subscription();
  assert r.status = 'active' and r.plan = 'yearly', 'owner keeps their own plan';
  assert (select code from public.family_invites) = 'ABCD2345', 'owner reads their invite';
end $$;
delete from public.family_members where member = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from public.family_members) = 0, 'owner can remove a member';
end $$;
reset role;
-- German and Arabic are supported languages; anything else still isn't.
insert into public.songs (id, title, artist, language, speech_lang, level, duration_sec, license)
  values ('de-song', 'Lied', 'A', 'de', 'de-DE', 'beginner', 30, 'original'), ('ar-song', 'أغنية', 'B', 'ar', 'ar-SA', 'beginner', 30, 'original');
do $$ begin
  begin
    insert into public.songs (id, title, artist, language, speech_lang, level, duration_sec, license) values ('xx', 'x', 'x', 'it', 'it-IT', 'beginner', 30, 'x');
    raise exception 'accepted an unsupported language';
  exception when check_violation then null;
  end;
end $$;
-- AI limits: the server counts requests per day and stops at the limit.
do $$ begin
  assert public.take_ai_request('user:a', 2), 'first AI request allowed';
  assert public.take_ai_request('user:a', 2), 'second AI request allowed';
  assert not public.take_ai_request('user:a', 2), 'third AI request refused at a limit of 2';
  assert public.take_ai_request('user:b', 2), 'limits are per subject';
  assert (select count from public.ai_usage where subject = 'user:a') = 2, 'refused requests are not counted';
end $$;
set role authenticated;
do $$ begin
  begin
    perform public.take_ai_request('user:a', 1000);
    raise exception 'learners can call take_ai_request';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.ai_usage) = 0, 'learners cannot read AI usage';
end $$;
reset role;
\echo 'RLS checks passed'

# Verso

Learn languages through songs: running synced lyrics, tap any word for its meaning, save words, practice them with AI, and learn together in song rooms.

Product plan and PRD: the Verso doc (PRD + Build plan tabs).

## What works today

- **App shell (steps 1–3):** Next.js + TypeScript + Tailwind; interface in English, French, Hebrew, Spanish, Ukrainian, Russian, German and Arabic (follows the device language until you pick one), right-to-left for Hebrew and Arabic, light/dark theme, email sign-in (once Supabase is connected).
- **Player (steps 7–10):** karaoke-style running lyrics with the sung word highlighted, translation line (always / on tap / off), repeat line, 0.75× slow mode, listen via the browser's voice, text size and lyric color, **Explain line** (AI), and a "you understand N% of this song" meter.
- **Word card (step 11):** meaning in context, base form, grammar note, pronunciation, Save and "I know it"; asks the AI automatically for words the bundled dictionary lacks (with the Hebrew root for Hebrew songs).
- **My Words (step 13):** saved words with their line; replay the line in one tap.
- **Review (step 14):** flashcards with spaced repetition (Again / Hard / Good / Easy).
- **Song quiz (step 15):** picture questions, comprehension, fill the word, put the line in order, Translator hint, tappable words, missed words go to review; **New AI quiz** at easy / medium / hard, validated against the lyrics before it's shown.
- **Sentence builder (step 16):** build a sentence from saved words and have the AI check it, or ask the AI to "make me a sentence" to translate.
- **Progress (step 18):** day streak and per-song understanding.
- **Launch (step 19):** first-visit onboarding (language you speak, language to learn, up to 3 favorite songs — typed-in songs are recorded to guide licensing); 3-song free trial with a paywall (the demo song is free); Stripe subscription checkout, customer portal and a signed webhook that keeps `subscriptions` up to date; anonymous analytics and a `/stats` dashboard for the launch gate (40% of new users save 5+ words in their first session).
- **Song Rooms (steps 20–24):** one room per song with a member count; room profile (name, emoji avatar, languages) with a 13+ age gate from birth month and year; live chat in **Song words only** mode (word bank, words outside the song underlined and Send disabled) or free mode; profanity filter; Translate on any message (AI); report (hides the message at once), block, mute, follow; a daily challenge per room with votes and yesterday's winner; a `/moderate` queue (restore, remove, remove + 7-day ban). Without the database, rooms run as a device demo that updates live across tabs.
- **Listening parties (step 25):** a Party tab in every room: the host's play, pause and seek reach everyone live, guests stay in sync, and emoji reactions float over the running line.
- **Language buddies (step 26):** matches people who speak the language you're learning (a "perfect match" when you each learn the other's), within your age group; private messages with Translate and Report. An under-18 can message an adult only after following them.
- **AI tutor (step 27):** Practice → AI tutor chats with you about a song using its words and your saved words, at easy / medium / hard, and corrects your mistakes kindly.
- **Artist uploads (step 28):** artists create a public page (`/artists`, then `/artists/<name>`) and submit songs from the timing tool with their audio; songs are published after a moderator approves them in `/moderate`. Published songs from the database appear in the catalog.
- **Licensed catalog, prepared (step 29):** songs can play from their official YouTube video; the timing tool imports LRC timed lyrics (the format lyrics providers deliver); license fields hide a song when its license expires. See `docs/licensing.md` for the legal review checklist.
- **More plans (step 30):** monthly, yearly and family plans (family: the owner invites up to 5 people with a code); subscribers can save songs for offline listening; `/progress` shows streak, words, listening time, review accuracy and charts.
- **Apps (step 31):** Verso installs from the browser as an app (home screen, full screen, offline). The native iOS/Android app (Expo) in `mobile/` has the same features — player, practice, Song Rooms, account, store subscriptions, offline songs — see `mobile/README.md`. App Store / Google Play purchases reach the database through `/api/billing/store` (RevenueCat webhook, secret `REVENUECAT_WEBHOOK_SECRET`).
- **More languages (step 32):** German and Arabic for the interface and as song languages.
- **Database (step 4):** Supabase schema with row-level security in `supabase/migrations/`.

Learner data (saved words, reviews, streak) lives on the device until sign-in syncs it to the database.

The demo song ("Down to the Sea", written for Verso) has no audio yet, so its lyrics run on a timer.

## Run locally

```bash

npm install
cp .env.example .env.local   # fill in keys (optional: the app runs without them)
npm run dev                  # http://localhost:3000
```

Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `./scripts/test-db.sh` (runs the migrations and row-level security checks on a throwaway local Postgres).

## Connect the services

1. **Supabase** — create a project at supabase.com. Copy the *Project URL* and *anon public key* (Settings → API) into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Run the SQL in `supabase/migrations/` (SQL editor, or `supabase db push`). Under Authentication → URL Configuration, add your site URL and `<site>/settings` as a redirect URL.
2. **Claude API** — create a key at console.anthropic.com and set `ANTHROPIC_API_KEY` (server only, never sent to the browser). AI features use Claude Opus 5.5 with structured outputs and server-side safety fallbacks. Without the key, AI buttons say "AI isn't connected yet" and everything else keeps working.

3. **Stripe** (payments) — create a monthly subscription price, then set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (and optionally `STRIPE_PRICE_ID_YEARLY` and `STRIPE_PRICE_ID_FAMILY` to offer those plans), and `SUPABASE_SERVICE_ROLE_KEY` (server only). Add a webhook endpoint `https://<site>/api/billing/webhook` for `checkout.session.completed` and `customer.subscription.created/updated/deleted`, and set its signing secret as `STRIPE_WEBHOOK_SECRET`. Turn on the customer portal in Stripe's settings.
4. **Song Rooms** — use the same Supabase keys plus `SUPABASE_SERVICE_ROLE_KEY`. Check that Realtime is on for `messages` and `message_votes` (the rooms migration adds them to the `supabase_realtime` publication). To make someone a moderator, run `insert into public.moderators (user_id) values ('<their user id>');` in the SQL editor. Rooms need the song's lyrics in `lyric_lines` (step 6). Listening parties use Realtime broadcast (no setup).
5. **Artist uploads** — the artists migration creates a public `audio` storage bucket (20 MB audio files). Moderators review submissions in `/moderate`.
6. **Analytics** — runs once `SUPABASE_SERVICE_ROLE_KEY` is set (events go to the `events` table, readable only by the server). Set `STATS_KEY` to a long random string and open `/stats?key=<STATS_KEY>`.

Settings in the app shows whether each service is connected.

### Trial enforcement

The trial is checked in the app today. Once songs live in the database (step 6), serve lyrics only through `public.can_play_song`, which enforces the same 3-song rule on the server.

### Rooms endpoint

`POST /api/rooms/{send|report|vote|resolve}` and `GET /api/rooms/queue` (moderators), with `Authorization: Bearer <access token>`. The server checks the profile, age, bans, the profanity filter, song-words-only mode and a burst limit before writing; learners read messages directly under row-level security, which hides reported messages and people they blocked.

### AI endpoint

`POST /api/ai/{task}` with `task` = `word`, `phrase`, `explain`, `quiz`, `check`, `sentence` or `translate`. Inputs are validated with zod (`src/lib/ai/schemas.ts`), cross-site calls are refused, and answers are cached per server instance. Before a public launch, add per-user rate limits (after sign-in) and move the cache to the `glossary` / `quizzes` tables.

## Deploy (Vercel)

This folder lives inside the Lexi repository for now. Create a Vercel project from the repo with **Root Directory** set to `verso`, and add the environment variables listed in `.env.example`. The tennis site at the repo root is unaffected.

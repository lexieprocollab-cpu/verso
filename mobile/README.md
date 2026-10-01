# Verso mobile (iOS and Android)

The native app, built with Expo (SDK 57) and Expo Router. It has the same
features as the web app and reuses its logic from `../src` unchanged:
- songs and lyric timing
- dictionaries in all 8 languages
- spaced repetition
- quiz checking
- Song Rooms rules, buddies and listening parties
- the rooms client and the catalog loader

## Features

- **Onboarding:** the language you speak, the one you learn, and favorite songs.
- **Catalog:** filter by language; "you understand N%" on every song.
- **Player:**
  - Audio (expo-audio), or the official YouTube video with synced lyrics.
  - Running lyrics with the sung word highlighted, and seek.
  - Repeat line, 0.75× speed, "Listen" (text to speech) and AI "Explain line".
  - Translation always, on tap, or off; text size.
- **Word card:** dictionary or AI meaning, base form, grammar, Hebrew and
  Arabic roots, pronunciation, Save and "I know it".
- **Practice:**
  - review flashcards (spaced repetition);
  - song quiz with pictures, fill-the-word, word order and a new AI quiz;
  - sentence builder;
  - AI tutor;
  - progress with charts.
- **My Words:** search, filters by status, song and language; notes;
  replay the line.
- **Song Rooms:**
  - live chat with song-words-only mode, word bank, Translate, Report,
    Block, Mute and Follow;
  - daily challenge with votes;
  - listening parties;
  - language buddies and private messages (with the under-18 rule).
- **Account:** sign in with a 6-digit email code (the same account as the
  website). Progress and plan are shared through the database.
- **Plans:**
  - the 3-song free trial and paywall;
  - App Store / Google Play subscriptions through RevenueCat;
  - restore purchases;
  - joining a family plan with a code;
  - offline songs (audio saved on the phone).

Without the database, Song Rooms run as an on-device demo, like the website's.

## Run it

```bash
cd mobile
npm install
cp .env.example .env   # fill in the values
npx expo start         # Expo Go for most features; a development build for purchases
```

Checks:
- `npm run typecheck`
- `npm run export:android` and `npm run export:web` (Metro bundles the whole
  app, including the shared code)

## Services

- **Web app (`EXPO_PUBLIC_API_URL`):** the AI, the rooms API and family
  invites are served by the Verso web app, so the Claude key stays on the
  server.
- **Supabase:** use the same project as the website. For the email code, the
  "Magic Link" email template must include `{{ .Token }}`, for example
  "Your code: {{ .Token }}". The link can stay for the website.
- **App Store / Google Play:**
  1. Create the subscription products. Product ids containing `year`/`annual`
     or `family` map to the yearly and family plans; anything else is monthly.
  2. Add them to a RevenueCat project and put its public keys in `.env`.
  3. In RevenueCat, add a webhook to `https://<site>/api/billing/store` with the
     Authorization header `Bearer <REVENUECAT_WEBHOOK_SECRET>`, and set the same
     secret on the web server.

  The app logs buyers in with their Verso user id, so a purchase unlocks the
  account on the website too. Store purchases need a development or store
  build (`npx eas build`); Expo Go can't make purchases.

## Sharing code with the web app

Import shared modules as `@shared/...`. Share only modules that don't touch
the browser (localStorage, `window`) or Next.js. Metro resolves every package
a shared file imports from this app's `node_modules`, so there's one React.

## Before the stores

- An Apple Developer account and a Google Play Console account, plus EAS.
- Final bundle ids: `com.verso.app` in `app.json` is a placeholder.
- App Store review needs a demo account and the privacy details (email,
  learning progress; Song Rooms has user-generated content with report and
  block).

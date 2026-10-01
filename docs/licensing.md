# Licensed catalog: checklist for the legal review (step 29)

Verso shows song lyrics, translates them, and quizzes learners on them. For
famous songs, every one of those uses needs permission. This page lists the
questions for the legal review and where the app already supports the answers.
It is a checklist for the team and a lawyer, not legal advice.

## Rights to clear

| What Verso does | Rights involved | Usual source | Question for the review |
| --- | --- | --- | --- |
| Plays the song | Sound recording and composition (public performance) | The official **YouTube video**, embedded with YouTube's player. Alternatively, direct licenses from labels plus performance-rights organizations | Does the embedded player cover our use? Streaming our own audio files needs direct licenses, which cost far more |
| Shows the lyrics, running in time | Lyrics are a literary work owned by the publishers | A **lyrics licensing company** that represents publishers | Is time-synced display included, or priced separately? Which territories? |
| Shows translations (human or AI) | A translation is a derivative work of the lyrics | Publishers, sometimes through the lyrics provider | Is translation covered? Many display licenses don't include it. Without it, translations can't ship for that song |
| Word cards, quizzes and sentence practice that quote lines | Part of lyrics display | Same as the lyrics | Are short quotations in exercises covered by the display license? |
| Song Rooms: chat using the song's words, and listening parties | Lyrics display, plus playback in sync for groups | Same as above | Confirm that group listening through the embedded player is allowed |
| Artist uploads (step 28) | The artist grants Verso a license | Our artist terms (to be written) | Draft artist terms: license scope, how artists remove songs, what happens to translations |

## Platform notes

- **YouTube.** The app uses the official IFrame player (`src/lib/media.ts`).
  It keeps the player visible, never extracts the audio, and doesn't block
  ads, all in line with the YouTube API Services terms. Re-read those terms
  and the YouTube developer policies during the review, especially the parts
  on synchronizing other content with a video.
- **Spotify.** Spotify's developer terms have restricted synchronizing Spotify
  audio with other content such as lyrics. Its Web Playback SDK also needs
  each listener to have Premium. Confirm the current terms before building on
  it. Nothing in the app depends on Spotify today.
- **Lyrics providers** usually require usage reports (how often each song's
  lyrics were shown). The `events` table (analytics) can produce these once a
  `lyrics_shown` event is added.

## What the app already supports

- `songs.youtube_id`: plays the official video instead of an audio file. It
  can be set in the song timing tool (step 2).
- **LRC import** in the timing tool (step 3): LRC is the timed-lyrics format
  providers deliver, including word timings ("enhanced LRC").
- License fields on `songs`: `rights_holder`, `lyrics_provider`,
  `license_ref`, `territories` and `license_expires_at`. A song and its lyrics
  **disappear automatically when the license expires** (row-level security,
  tested in `supabase/tests/rls.sql`).
- Taking a song down: set `is_published = false` or `license_expires_at =
  now()`.

## Still to build after the review

- **Enforce territories.** The server needs the learner's country (for
  example the `x-vercel-ip-country` header) to filter songs whose license
  covers only some countries.
- **Takedowns.** Designate a copyright agent and add a public takedown contact
  and process page.
- **Per-song translation rules.** If translation rights vary by song, add a
  `translations_allowed` flag and hide translations and AI "Explain line"
  where it's false.

import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy policy · Verso" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        Verso helps you learn languages through songs. This page explains what we collect, why, who helps us run the service, and how to
        delete your data. Questions: <Contact />.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> your email address, used to sign you in with a link or a 6-digit code.
        </li>
        <li>
          <strong>Learning data:</strong> saved and known words, reviews, quiz results, streaks and settings. It is kept on your device, and
          in our database when you are signed in so it follows you between devices.
        </li>
        <li>
          <strong>Room profile</strong> (only if you join Song Rooms or Buddies): display name, avatar, the languages you speak and learn,
          favourite songs, and your birth month and year. We use your age to keep under-13s out and to protect learners under 18; other
          learners never see your birth date.
        </li>
        <li>
          <strong>Messages:</strong> what you write in Song Rooms and direct messages, your votes, follows, blocks and reports. Moderators
          can read messages that someone reported.
        </li>
        <li>
          <strong>Artist uploads:</strong> the audio files, lyrics and artist name you submit.
        </li>
        <li>
          <strong>Payments:</strong> card details go straight to Stripe (web) or Apple and Google (apps); we never see them. We keep your
          plan, its status and renewal date.
        </li>
        <li>
          <strong>Usage statistics:</strong> anonymous events such as &quot;song started&quot; or &quot;word saved&quot;, tied to a random
          device id, not to your account or email. They tell us whether Verso helps people learn.
        </li>
        <li>
          <strong>AI requests:</strong> when you ask for a meaning, an explanation, a quiz or the tutor, the word, lyric line or question is
          sent to our AI provider to write the answer. To limit use per day we count requests by account, or for guests by a scrambled
          (hashed) form of the IP address; these counts are deleted after 7 days.
        </li>
      </ul>

      <h2>Who helps us run Verso</h2>
      <ul>
        <li>Supabase: database, sign-in and file storage (servers in the United States).</li>
        <li>Vercel: website hosting.</li>
        <li>Anthropic: the AI that answers word, line and tutor questions.</li>
        <li>Stripe: web payments. Apple, Google and RevenueCat: subscriptions bought in the apps.</li>
        <li>
          YouTube (Google): songs with an official video play in YouTube&apos;s player, and Google may collect data under the{" "}
          <a href="https://policies.google.com/privacy" className="underline">
            Google privacy policy
          </a>
          .
        </li>
        <li>An email service that sends sign-in emails.</li>
      </ul>
      <p>We do not sell your data and we do not show ads.</p>

      <h2>How long we keep it</h2>
      <p>
        Until you delete your account. Anonymous usage statistics are kept to measure the service over time and cannot be traced back to
        you.
      </p>

      <h2>Deleting your data and your other rights</h2>
      <p>
        Delete your account any time in <Link href="/settings">Settings → Account → Delete account</Link> (also in the app). This removes
        your account, learning data, profile, messages, uploads and web subscription. Subscriptions bought through the App Store or Google
        Play must also be cancelled in your phone&apos;s settings.
      </p>
      <p>
        You can also ask us for a copy of your data, to correct it, or to stop a use you object to: write to <Contact />. If you live in the
        EU or UK you can complain to your data protection authority.
      </p>

      <h2>Children</h2>
      <p>
        Verso is for people aged 13 and over. Learners under 18 get extra protection in Song Rooms: they can only message an adult after
        choosing to follow them, and a profanity filter applies to everyone. A parent who believes their child under 13 signed up can
        contact us and we will delete the account.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy we will update the date above and tell signed-in learners about important changes.</p>
    </LegalPage>
  );
}

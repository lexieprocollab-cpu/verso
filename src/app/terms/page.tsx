import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of use · Verso" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <p>
        These terms apply when you use Verso on the web or in the apps. By using Verso you agree to them. Questions: <Contact />.
      </p>

      <h2>Who can use Verso</h2>
      <p>
        You must be at least 13. If you are under 18, check with a parent or guardian before subscribing. Keep your sign-in email secure;
        you are responsible for what happens in your account.
      </p>

      <h2>Songs and lyrics</h2>
      <p>
        Songs, lyrics and videos belong to their artists and rights holders. They are in Verso for personal language learning only:
        don&apos;t copy, download or republish them outside the app. Songs with an official video play through YouTube and are also covered
        by the{" "}
        <a href="https://www.youtube.com/t/terms" className="underline">
          YouTube Terms of Service
        </a>
        . Songs can leave the catalogue when a licence ends.
      </p>

      <h2>Song Rooms, messages and behaviour</h2>
      <ul>
        <li>Be kind. No harassment, hate, sexual content, threats or spam.</li>
        <li>Don&apos;t share personal details such as addresses or phone numbers, yours or anyone else&apos;s.</li>
        <li>Don&apos;t pretend to be someone else or misstate your age.</li>
        <li>Report anything that breaks these rules. Moderators can hide messages and suspend or remove accounts that break them.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You own what you write and upload. You let Verso store and show it to other learners so the features work (for example, room
        messages to people in the room). Artists who upload songs confirm they own or control the rights to the recording and lyrics, and
        let Verso stream them to learners until they remove the song or delete their account.
      </p>

      <h2>AI answers</h2>
      <p>
        Meanings, explanations, quizzes and the tutor are written by AI. They are usually helpful but can be wrong; check anything
        important. There is a daily limit on AI requests to keep the service running for everyone.
      </p>

      <h2>Free trial and subscriptions</h2>
      <ul>
        <li>You can try Verso free with a limited number of songs before choosing a plan.</li>
        <li>
          Plans renew automatically each month or year until you cancel. Cancel any time: on the web in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>{" "}
          (Manage subscription), or in your App Store or Google Play settings for app subscriptions. You keep access until the end of the
          period you paid for.
        </li>
        <li>Refunds follow the law where you live and, for app purchases, the rules of the App Store or Google Play.</li>
        <li>Prices are shown before you pay. If a price changes, we tell you before your next renewal.</li>
      </ul>

      <h2>Ending your account</h2>
      <p>
        You can delete your account any time in Settings. We may suspend or close accounts that break these terms or the law. See the{" "}
        <Link href="/privacy">privacy policy</Link> for what deletion removes.
      </p>

      <h2>Our responsibility</h2>
      <p>
        We work to keep Verso available and accurate, but it is provided as it is, without a promise that it will always be available or
        error-free. Nothing in these terms limits rights you have by law as a consumer.
      </p>

      <h2>Changes</h2>
      <p>If we change these terms we will update the date above and tell signed-in learners about important changes.</p>
    </LegalPage>
  );
}

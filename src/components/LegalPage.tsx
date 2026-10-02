import Link from "next/link";
import type { ReactNode } from "react";

/** Contact address for privacy and legal questions; NEXT_PUBLIC_CONTACT_EMAIL in Vercel overrides it. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "lexieprocollab@gmail.com";

export const LEGAL_UPDATED = "2 October 2026";

/** Shared layout for the privacy policy and terms (English; the binding version). */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article
      dir="ltr"
      lang="en"
      className="mx-auto max-w-2xl space-y-4 py-6 leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ms-5 [&_li]:list-disc"
    >
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted">Last updated {LEGAL_UPDATED}</p>
      {children}
      <p className="pt-6 text-sm text-muted">
        <Link href="/privacy" className="underline">
          Privacy policy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="underline">
          Terms of use
        </Link>{" "}
        ·{" "}
        <Link href="/settings" className="underline">
          Settings
        </Link>
      </p>
    </article>
  );
}

/** How to reach us, or a note that the address is coming. */
export function Contact() {
  return CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
      {CONTACT_EMAIL}
    </a>
  ) : (
    <span>the contact address that will be listed here (being set up)</span>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { demoSong } from "@/content/demoSong";
import { format } from "@/lib/i18n";
import { reviewsStore, savedWordsStore, wordId } from "@/lib/learnerStores";
import { isDue } from "@/lib/srs";
import { usePreferences } from "./Preferences";
import { useStreak } from "./useProgress";

export function PracticeHub() {
  const { t } = usePreferences();
  const words = savedWordsStore.useValue();
  const reviews = reviewsStore.useValue();
  const streakDays = useStreak();
  const [now] = useState(() => Date.now());
  const due = words.filter((w) => isDue(reviews[wordId(w.songId, w.key)], now)).length;

  const cards = [
    {
      href: "/practice/review",
      icon: "🃏",
      title: t.practice.review,
      detail: words.length === 0 ? t.words.empty : due > 0 ? format(t.practice.reviewDue, { n: due }) : t.practice.reviewNone,
    },
    { href: "/practice/quiz", icon: "🎯", title: t.practice.quiz, detail: demoSong.title },
    { href: "/practice/sentence", icon: "🧩", title: t.practice.sentence, detail: t.sentence.hint },
    { href: "/practice/tutor", icon: "💬", title: t.tutor.title, detail: t.tutor.hint },
    { href: "/progress", icon: "📈", title: t.stats.open, detail: t.stats.openHint },
  ];

  return (
    <section className="pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold">{t.nav.practice}</h1>
        {streakDays > 0 && <span className="font-semibold">🔥 {format(t.more.streak, { n: streakDays })}</span>}
      </div>
      <ul className="mt-5 grid gap-3">
        {cards.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 hover:border-accent"
            >
              <span className="text-4xl" aria-hidden="true">
                {card.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold">{card.title}</span>
                <span className="block text-sm text-muted">{card.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

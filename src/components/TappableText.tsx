"use client";

import { tokenize, type PhraseSpan } from "@/lib/song";

/**
 * Renders text with every word as a button. Word indexes count words only:
 * `highlight` marks the word being sung, `phrases` get a dotted underline,
 * and `selected` (an inclusive range) marks a phrase being picked.
 */
export function TappableText({
  text,
  onWord,
  highlight = -1,
  isKnown,
  phrases,
  selected,
  className = "",
}: {
  text: string;
  onWord: (key: string, word: string, index: number) => void;
  highlight?: number;
  /** When given, only known words are tappable; the rest render as plain text. */
  isKnown?: (key: string) => boolean;
  phrases?: PhraseSpan[];
  selected?: readonly [number, number] | null;
  className?: string;
}) {
  let wordIndex = -1;
  return (
    <span className={className}>
      {tokenize(text).map((token, i) => {
        if (!token.isWord) return <span key={i}>{token.text}</span>;
        wordIndex++;
        const index = wordIndex;
        if (isKnown && !isKnown(token.key)) return <span key={i}>{token.text}</span>;
        const active = index === highlight;
        const inSelection = selected && index >= Math.min(...selected) && index <= Math.max(...selected);
        const inPhrase = phrases?.some((p) => index >= p.from && index <= p.to);
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onWord(token.key, token.text, index);
            }}
            className={`-mx-0.5 rounded-md px-0.5 underline decoration-2 underline-offset-4 transition-colors hover:decoration-current focus-visible:decoration-current ${
              inPhrase ? "decoration-dotted decoration-current/40" : "decoration-transparent"
            } ${inSelection ? "bg-amber-300/50 dark:bg-amber-500/40" : active ? "bg-accent-soft text-accent" : ""}`}
          >
            {token.text}
          </button>
        );
      })}
    </span>
  );
}

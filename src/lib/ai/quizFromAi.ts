import { isPictureKey, PICTURES } from "../pictures";
import { lineWords, wordKey, type QuizItem } from "../song";
import type { UiLanguage } from "../i18n";
import type { QuizResult } from "./schemas";

/**
 * Turns the model's quiz into Verso quiz items, dropping any item that
 * doesn't check out against the lyrics (wrong line, answer not in the line,
 * unknown picture, not exactly one correct choice).
 */
export function quizFromAi(result: QuizResult, lines: string[], meaning: UiLanguage): QuizItem[] {
  const items: QuizItem[] = [];
  for (const raw of result.items) {
    const oneCorrect = raw.choices.filter((c) => c.correct).length === 1;
    const translations = raw.question_translation ? { [meaning]: raw.question_translation } : {};

    if (raw.kind === "picture") {
      const ok =
        raw.question &&
        oneCorrect &&
        raw.choices.length >= 2 &&
        raw.choices.length <= 4 &&
        raw.choices.every((c) => isPictureKey(c.picture) && c.text);
      if (!ok) continue;
      items.push({
        kind: "picture",
        question: raw.question,
        translations,
        choices: raw.choices.map((c) => ({
          emoji: PICTURES[c.picture as keyof typeof PICTURES],
          word: c.text,
          ...(c.correct ? { correct: true } : {}),
        })),
      });
    } else if (raw.kind === "choice") {
      if (!raw.question || !oneCorrect || raw.choices.length < 2 || raw.choices.some((c) => !c.text)) continue;
      items.push({
        kind: "choice",
        question: raw.question,
        translations,
        choices: raw.choices.map((c) => ({ text: c.text, ...(c.correct ? { correct: true } : {}) })),
      });
    } else if (raw.kind === "fill") {
      const line = lines[raw.line];
      if (!line) continue;
      const answer = lineWords(line).find((w) => wordKey(w) === wordKey(raw.answer));
      const options = [...new Set(raw.options.map((o) => o.trim()).filter(Boolean))];
      if (!answer || options.length < 2 || !options.some((o) => wordKey(o) === wordKey(answer))) continue;
      items.push({
        kind: "fill",
        line: raw.line,
        answer,
        options: options.map((o) => (wordKey(o) === wordKey(answer) ? answer : o)),
      });
    } else {
      const line = lines[raw.line];
      if (!line || lineWords(line).length < 3) continue;
      items.push({ kind: "order", line: raw.line });
    }
  }
  return items;
}

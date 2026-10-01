import * as z from "zod/v4";
import { UI_LANGUAGES } from "../i18n";
import { PICTURE_KEYS } from "../pictures";

// Request and response shapes for the AI endpoints. Shared by the server
// (validation, structured outputs) and the client (typed fetch helpers).

const lang = z.enum(UI_LANGUAGES);
const text = (max: number) => z.string().trim().min(1).max(max);

export const wordRequest = z.object({
  word: text(60),
  line: text(300),
  learn: lang,
  meaning: lang,
});
export const wordResult = z.object({
  meaning: z.string().describe("Short meaning of the word in this line, in the learner's language"),
  lemma: z.string().describe("Dictionary form if different from the word, else empty"),
  note: z.string().describe("One short grammar note in the learner's language, or empty"),
  // Named for Hebrew first; Arabic words have roots too (the field and column keep the name).
  hebrew_root: z.string().describe("Root letters if the word is Hebrew (e.g. ש-י-ר) or Arabic (e.g. ك-ت-ب), else empty"),
});

export const phraseRequest = z.object({
  phrase: text(120),
  line: text(300),
  learn: lang,
  meaning: lang,
});
export const phraseResult = z.object({
  meaning: z.string().describe("What the phrase means in this line, in the learner's language"),
  literal: z.string().describe("Word-for-word translation into the learner's language"),
  is_idiom: z.boolean().describe("True if the meaning is not the sum of the words"),
  note: z.string().describe("One short usage note in the learner's language, or empty"),
});

export const explainRequest = z.object({
  line: text(300),
  learn: lang,
  meaning: lang,
});
export const explainResult = z.object({
  meaning: z.string().describe("What the line means, in the learner's language"),
  grammar: z.string().describe("The key grammar in the line, in the learner's language"),
  culture: z.string().describe("Idioms, slang or cultural background, in the learner's language; empty if none"),
});

export const quizRequest = z.object({
  title: text(120),
  lines: z.array(text(300)).min(2).max(80),
  learn: lang,
  meaning: lang,
  level: z.enum(["easy", "medium", "hard"]),
});
export const quizResult = z.object({
  items: z.array(
    z.object({
      kind: z.enum(["picture", "choice", "fill", "order"]),
      question: z.string().describe("Question in the song's language; empty for fill and order"),
      question_translation: z.string().describe("The question in the learner's language; empty for fill and order"),
      choices: z
        .array(
          z.object({
            text: z.string().describe("Answer text in the song's language"),
            picture: z.enum(["none", ...PICTURE_KEYS]).describe("Picture key for picture questions, else none"),
            correct: z.boolean(),
          }),
        )
        .describe("3 choices for picture and choice questions, else empty"),
      line: z.number().int().describe("0-based lyric line index for fill and order, else -1"),
      answer: z.string().describe("For fill: the exact word removed from the line, else empty"),
      options: z.array(z.string()).describe("For fill: 3 options including the answer, else empty"),
    }),
  ),
});

export const checkRequest = z.object({
  sentence: text(300),
  words: z.array(text(60)).max(50),
  learn: lang,
  meaning: lang,
});
export const checkResult = z.object({
  is_correct: z.boolean(),
  corrected: z.string().describe("Corrected sentence in the language being learned (same as input if correct)"),
  explanation: z.string().describe("Short, friendly explanation in the learner's language"),
  translation: z.string().describe("Translation of the corrected sentence into the learner's language"),
});

export const makeSentenceRequest = z.object({
  words: z.array(text(60)).min(1).max(50),
  learn: lang,
  meaning: lang,
});
export const makeSentenceResult = z.object({
  sentence: z.string().describe("A short, natural sentence in the language being learned"),
  translation: z.string().describe("Its translation into the learner's language"),
});

export const translateRequest = z.object({
  lines: z.array(z.string().max(300)).min(1).max(80),
  learn: lang,
  target: lang,
});
export const translateResult = z.object({
  translations: z.array(z.string()).describe("One translation per input line, same order and count"),
});

export const tutorRequest = z.object({
  learn: lang,
  meaning: lang,
  level: z.enum(["easy", "medium", "hard"]),
  song: z.string().trim().max(120).optional(),
  /** Words to talk with: the song's words and the learner's saved words. */
  words: z.array(text(60)).max(120),
  /** The conversation so far, oldest first; empty to let the tutor open. */
  history: z
    .array(z.object({ role: z.enum(["learner", "tutor"]), text: text(500) }))
    .max(30),
});
export const tutorResult = z.object({
  reply: z.string().describe("The tutor's next message in the language being learned: 1-3 short sentences, ending with a question"),
  translation: z.string().describe("The reply translated into the learner's language"),
  has_mistake: z.boolean().describe("True if the learner's last message has a real mistake"),
  corrected: z.string().describe("The learner's last message corrected, or empty if there is no mistake"),
  explanation: z.string().describe("One short, kind explanation of the mistake in the learner's language, or empty"),
});

export type WordResult = z.infer<typeof wordResult>;
export type ExplainResult = z.infer<typeof explainResult>;
export type QuizResult = z.infer<typeof quizResult>;
export type CheckResult = z.infer<typeof checkResult>;
export type MakeSentenceResult = z.infer<typeof makeSentenceResult>;
export type TutorResult = z.infer<typeof tutorResult>;

export const AI_TASKS = {
  word: { request: wordRequest, result: wordResult },
  explain: { request: explainRequest, result: explainResult },
  phrase: { request: phraseRequest, result: phraseResult },
  quiz: { request: quizRequest, result: quizResult },
  check: { request: checkRequest, result: checkResult },
  sentence: { request: makeSentenceRequest, result: makeSentenceResult },
  translate: { request: translateRequest, result: translateResult },
  tutor: { request: tutorRequest, result: tutorResult },
} as const;

export type AiTask = keyof typeof AI_TASKS;
export type AiRequest<T extends AiTask> = z.infer<(typeof AI_TASKS)[T]["request"]>;
export type AiResponse<T extends AiTask> = z.infer<(typeof AI_TASKS)[T]["result"]>;

export function isAiTask(value: string): value is AiTask {
  return value in AI_TASKS;
}

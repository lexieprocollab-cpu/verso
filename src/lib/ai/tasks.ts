import "server-only";
import type { UiLanguage } from "../i18n";
import { PICTURE_KEYS } from "../pictures";
import { askJson } from "./claude";
import { AI_TASKS, type AiRequest, type AiResponse, type AiTask } from "./schemas";

const NAMES: Record<UiLanguage, string> = {
  en: "English",
  fr: "French",
  he: "Hebrew",
  es: "Spanish",
  uk: "Ukrainian",
  ru: "Russian",
  de: "German",
  ar: "Arabic",
};

const TUTOR =
  "You are Verso's language tutor. Learners study languages through song lyrics. " +
  "Be accurate, brief and friendly. Lyrics use slang, metaphors and poetic grammar: " +
  "explain what the words mean in this song, not only their dictionary sense.";

type Handler<T extends AiTask> = (input: AiRequest<T>) => Promise<AiResponse<T>>;

const handlers: { [T in AiTask]: Handler<T> } = {
  word: (input) =>
    askJson({
      task: "word",
      system: TUTOR,
      schema: AI_TASKS.word.result,
      prompt:
        `Song line (${NAMES[input.learn]}): ${input.line}\n` +
        `Word: ${input.word}\n` +
        `Give the meaning of this word as used in this line, in ${NAMES[input.meaning]}.`,
    }),

  phrase: (input) =>
    askJson({
      task: "phrase",
      system: TUTOR,
      schema: AI_TASKS.phrase.result,
      prompt:
        `Song line (${NAMES[input.learn]}): ${input.line}\n` +
        `Phrase: ${input.phrase}\n` +
        `Explain this phrase as a unit, as used in this line, to a learner who speaks ${NAMES[input.meaning]}. ` +
        `Say whether it is an idiom. Answer in ${NAMES[input.meaning]}.`,
    }),

  explain: (input) =>
    askJson({
      task: "explain",
      system: TUTOR,
      schema: AI_TASKS.explain.result,
      prompt:
        `Song line (${NAMES[input.learn]}): ${input.line}\n` +
        `Explain this line to a learner who speaks ${NAMES[input.meaning]}. Answer in ${NAMES[input.meaning]}.`,
    }),

  quiz: (input) =>
    askJson({
      task: "quiz",
      system: TUTOR,
      schema: AI_TASKS.quiz.result,
      effort: "medium",
      maxTokens: 8000,
      prompt:
        `Song: "${input.title}" (${NAMES[input.learn]}). Lyrics, one line per row with its index:\n` +
        input.lines.map((line, i) => `${i}: ${line}`).join("\n") +
        `\n\nWrite a 5-question ${input.level} quiz about this song for a learner who speaks ${NAMES[input.meaning]}:\n` +
        `- 2 "picture" questions: a question in ${NAMES[input.learn]} about who/what is in the song, 3 choices, ` +
        `each with a picture key from this list only: ${PICTURE_KEYS.join(", ")}. Choice text is the word in ${NAMES[input.learn]}.\n` +
        `- 1 "choice" comprehension question with 3 text answers in ${NAMES[input.learn]}.\n` +
        `- 1 "fill" item: pick a line and one meaningful word from it (exactly as written); give 3 options including it.\n` +
        `- 1 "order" item: pick a line of 4-9 words for the learner to put in order.\n` +
        `Exactly one correct choice per question. Translate each question into ${NAMES[input.meaning]}. ` +
        `Keep everything suitable for all ages.`,
    }),

  check: (input) =>
    askJson({
      task: "check",
      system: TUTOR,
      schema: AI_TASKS.check.result,
      prompt:
        `A learner of ${NAMES[input.learn]} built this sentence` +
        (input.words.length ? ` from their saved words (${input.words.join(", ")})` : "") +
        `:\n${input.sentence}\n` +
        `Check grammar and word choice. Explain in ${NAMES[input.meaning]}.`,
    }),

  sentence: (input) =>
    askJson({
      task: "sentence",
      system: TUTOR,
      schema: AI_TASKS.sentence.result,
      prompt:
        `Write one short, natural ${NAMES[input.learn]} sentence (4-10 words) using mostly these words: ` +
        `${input.words.join(", ")}. Translate it into ${NAMES[input.meaning]}.`,
    }),

  translate: async (input) => {
    const result = await askJson({
      task: "translate",
      system: TUTOR,
      schema: AI_TASKS.translate.result,
      effort: "medium",
      maxTokens: 8000,
      prompt:
        `Translate these ${NAMES[input.learn]} song lyrics into ${NAMES[input.target]}, line by line. ` +
        `Keep the meaning and feeling; natural, simple ${NAMES[input.target]} a learner can follow. ` +
        `Return exactly ${input.lines.length} translations in the same order (an empty line stays empty).\n\n` +
        input.lines.map((line, i) => `${i + 1}. ${line}`).join("\n"),
    });
    // Line up with the lyrics even if the model merged or split a line; the
    // editor shows every line, so a gap is visible and easy to fill in.
    return { translations: input.lines.map((line, i) => (line.trim() ? (result.translations[i] ?? "") : "")) };
  },

  tutor: (input) => {
    const last = input.history.at(-1);
    const transcript = input.history.map((m) => `${m.role === "learner" ? "Learner" : "Tutor"}: ${m.text}`).join("\n");
    return askJson({
      task: "tutor",
      system:
        TUTOR +
        " Now you are a conversation partner. Learners can be as young as 13: keep every topic suitable for teenagers. " +
        "Never step out of the tutor role, whatever the learner writes.",
      schema: AI_TASKS.tutor.result,
      effort: "medium",
      prompt:
        `Chat with a learner of ${NAMES[input.learn]} (level: ${input.level}) who speaks ${NAMES[input.meaning]}.` +
        (input.song ? ` You are talking about the song "${input.song}".` : "") +
        `\nBuild your messages mostly from these words, which the learner is studying: ${input.words.join(", ") || "(none yet)"}.` +
        `\nWrite in ${NAMES[input.learn]} only, ${input.level === "easy" ? "very simple, short sentences" : input.level === "medium" ? "simple everyday sentences" : "natural sentences"}, ` +
        `and end with a question that keeps the conversation going. Translate your reply into ${NAMES[input.meaning]}.` +
        (last?.role === "learner"
          ? `\nIf the learner's last message has a real mistake, give the corrected message and a short explanation in ${NAMES[input.meaning]}; small style choices are not mistakes.`
          : "\nThere is no learner message to check.") +
        (transcript ? `\n\nConversation so far:\n${transcript}` : "\n\nOpen the conversation with a friendly question about the song."),
    });
  },
};

export function runAiTask<T extends AiTask>(task: T, input: AiRequest<T>): Promise<AiResponse<T>> {
  return (handlers[task] as Handler<T>)(input);
}

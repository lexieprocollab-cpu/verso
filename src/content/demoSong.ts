import type { Gloss, LyricLine, Song } from "@/lib/song";

// An original demo song written for Verso (no licensing needed). Real songs
// will come from the catalog in steps 4–6; this one lets the player, word
// cards and quiz run end to end before the database is connected.

const LINE_LENGTH = 3.8;
const LINE_GAP = 0.4;
const FIRST_LINE = 1;

const text: [string, LyricLine["translations"]][] = [
  [
    "I walked my dog down to the sea",
    {
      ru: "Я выгулял собаку до самого моря",
      uk: "Я вигуляв собаку аж до моря",
      he: "הלכתי עם הכלב שלי עד לים",
      fr: "J'ai promené mon chien jusqu'à la mer",
      es: "Paseé a mi perro hasta el mar",
      de: "Ich ging mit meinem Hund hinunter zum Meer",
      ar: "مشيتُ مع كلبي حتى البحر",
    },
  ],
  [
    "The sun was warm and smiled at me",
    {
      ru: "Солнце было тёплым и улыбалось мне",
      uk: "Сонце було теплим і всміхалося мені",
      he: "השמש הייתה חמה וחייכה אליי",
      fr: "Le soleil était chaud et me souriait",
      es: "El sol era cálido y me sonreía",
      de: "Die Sonne war warm und lächelte mich an",
      ar: "كانت الشمس دافئة وابتسمت لي",
    },
  ],
  [
    "I met a girl, she said hello",
    {
      ru: "Я встретил девушку, она сказала «привет»",
      uk: "Я зустрів дівчину, вона сказала «привіт»",
      he: "פגשתי בחורה, היא אמרה שלום",
      fr: "J'ai rencontré une fille, elle m'a dit bonjour",
      es: "Conocí a una chica, ella me dijo hola",
      de: "Ich traf ein Mädchen, sie sagte Hallo",
      ar: "قابلتُ فتاة، قالت لي مرحبًا",
    },
  ],
  [
    "We sang a song we didn't know",
    {
      ru: "Мы пели песню, которую не знали",
      uk: "Ми співали пісню, якої не знали",
      he: "שרנו שיר שלא הכרנו",
      fr: "Nous avons chanté une chanson inconnue",
      es: "Cantamos una canción que no conocíamos",
      de: "Wir sangen ein Lied, das wir nicht kannten",
      ar: "غنّينا أغنية لم نكن نعرفها",
    },
  ],
  [
    "And every word was new to me",
    {
      ru: "И каждое слово было для меня новым",
      uk: "І кожне слово було для мене новим",
      he: "וכל מילה הייתה חדשה לי",
      fr: "Et chaque mot était nouveau pour moi",
      es: "Y cada palabra era nueva para mí",
      de: "Und jedes Wort war neu für mich",
      ar: "وكانت كل كلمة جديدة عليّ",
    },
  ],
  [
    "That's how I learned to sing for free",
    {
      ru: "Вот так я научился петь — просто так",
      uk: "Ось так я навчився співати — просто так",
      he: "ככה למדתי לשיר בחינם",
      fr: "C'est comme ça que j'ai appris à chanter librement",
      es: "Así aprendí a cantar gratis",
      de: "So habe ich gelernt, einfach so zu singen",
      ar: "هكذا تعلّمتُ الغناء بلا مقابل",
    },
  ],
];

const lines: LyricLine[] = text.map(([lineText, translations], i) => {
  const start = FIRST_LINE + i * (LINE_LENGTH + LINE_GAP);
  return { start, end: start + LINE_LENGTH, text: lineText, translations };
});

const g = (
  ru: string,
  uk: string,
  he: string,
  fr: string,
  es: string,
  de: string,
  ar: string,
  extra: Omit<Gloss, "meanings"> = {},
): Gloss => ({
  ...extra,
  meanings: { ru, uk, he, fr, es, de, ar },
});

const glossary: Record<string, Gloss> = {
  i: g("я", "я", "אני", "je", "yo", "ich", "أنا", { note: "Always written with a capital I." }),
  walked: g("выгулял, гулял", "вигуляв, гуляв", "טיילתי, הלכתי", "ai promené", "paseé", "ging spazieren, führte aus", "تمشّيتُ، مشيتُ", {
    lemma: "walk",
    note: "Past simple of walk. “Walk a dog” = take a dog out.",
  }),
  my: g("мой, моя", "мій, моя", "שלי", "mon, ma", "mi", "mein, meine", "ـي (ملكي)"),
  dog: g("собака", "собака", "כלב", "chien", "perro", "Hund", "كلب"),
  down: g("вниз; до", "вниз; до", "למטה; עד", "en bas ; jusqu'à", "abajo; hasta", "hinunter; bis", "إلى الأسفل؛ حتى", {
    note: "“Down to” = all the way to.",
  }),
  to: g("к, до, в", "до, у", "אל, ל־", "à, vers", "a, hacia", "zu, nach, bis", "إلى، نحو"),
  the: g("(артикль, не переводится)", "(артикль, не перекладається)", "ה־ (ה' הידיעה)", "le, la", "el, la", "der, die, das", "الـ (أداة التعريف)", {
    note: "Definite article: a specific thing.",
  }),
  sea: g("море", "море", "ים", "mer", "mar", "Meer", "بحر"),
  sun: g("солнце", "сонце", "שמש", "soleil", "sol", "Sonne", "شمس"),
  was: g("был, была, было", "був, була, було", "היה, הייתה", "était", "era, estaba", "war", "كان، كانت", {
    lemma: "be",
    note: "Past simple of be (I / he / she / it was).",
  }),
  warm: g("тёплый", "теплий", "חם", "chaud", "cálido", "warm", "دافئ"),
  and: g("и", "і", "ו־, וגם", "et", "y", "und", "و"),
  smiled: g("улыбнулся, улыбалось", "усміхнувся, всміхалося", "חייך, חייכה", "a souri", "sonrió", "lächelte", "ابتسم، ابتسمت", {
    lemma: "smile",
    note: "Past simple of smile. “Smile at someone.”",
  }),
  at: g("на, в (smile at — улыбаться кому-то)", "на, до (smile at — усміхатися комусь)", "אל, על", "à", "a", "an (jemanden anlächeln)", "إلى، لـ (ابتسم لـ)"),
  me: g("меня, мне", "мене, мені", "אותי, לי, אליי", "me, moi", "me, mí", "mich, mir", "ـني، لي"),
  met: g("встретил, познакомился", "зустрів, познайомився", "פגשתי", "ai rencontré", "conocí", "traf, lernte kennen", "قابلتُ، تعرّفتُ على", {
    lemma: "meet",
    note: "Past simple of meet (irregular: meet → met).",
  }),
  a: g("(артикль: один, какой-то)", "(артикль: один, якийсь)", "(אין מילה מקבילה: אחד, אחת)", "un, une", "un, una", "ein, eine", "(أداة نكرة: واحد، ما)", {
    note: "Indefinite article: one, any.",
  }),
  girl: g("девушка, девочка", "дівчина, дівчинка", "בחורה, ילדה", "fille", "chica, niña", "Mädchen", "فتاة، بنت"),
  she: g("она", "вона", "היא", "elle", "ella", "sie", "هي"),
  said: g("сказала, сказал", "сказала, сказав", "אמרה, אמר", "a dit", "dijo", "sagte", "قالت، قال", {
    lemma: "say",
    note: "Past simple of say (irregular: say → said).",
  }),
  hello: g("привет, здравствуй", "привіт, вітаю", "שלום", "bonjour, salut", "hola", "hallo", "مرحبًا"),
  we: g("мы", "ми", "אנחנו", "nous", "nosotros", "wir", "نحن"),
  sang: g("пели, пел", "співали, співав", "שרנו, שר", "avons chanté", "cantamos", "sangen, sang", "غنّينا، غنّى", {
    lemma: "sing",
    note: "Past simple of sing (irregular: sing → sang → sung).",
  }),
  song: g("песня", "пісня", "שיר", "chanson", "canción", "Lied", "أغنية"),
  "didn't": g("не (в прошедшем времени)", "не (у минулому часі)", "לא (בעבר)", "ne … pas (au passé)", "no (en pasado)", "nicht (Vergangenheit)", "لم (في الماضي)", {
    lemma: "did not",
    note: "Short for did not: past negative. “We didn't know” = we did not know.",
  }),
  know: g("знать", "знати", "לדעת, להכיר", "savoir, connaître", "saber, conocer", "wissen, kennen", "يعرف"),
  every: g("каждый", "кожен", "כל", "chaque", "cada", "jedes, jeder", "كل"),
  word: g("слово", "слово", "מילה", "mot", "palabra", "Wort", "كلمة"),
  new: g("новый", "новий", "חדש", "nouveau", "nuevo", "neu", "جديد"),
  "that's": g("это, вот", "це, ось", "זה", "c'est", "eso es", "das ist, so", "هذا، هكذا", {
    lemma: "that is",
    note: "Short for that is. “That's how…” = this is the way…",
  }),
  how: g("как", "як", "איך", "comment", "cómo", "wie", "كيف"),
  learned: g("научился, выучил", "навчився, вивчив", "למדתי", "ai appris", "aprendí", "lernte, habe gelernt", "تعلّمتُ", {
    lemma: "learn",
    note: "Past simple of learn. “Learn to do something.”",
  }),
  sing: g("петь", "співати", "לשיר", "chanter", "cantar", "singen", "يغنّي"),
  for: g("для, за (for free — бесплатно, просто так)", "для, за (for free — безкоштовно)", "בשביל (for free = בחינם)", "pour (for free = gratuitement)", "para, por (for free = gratis)", "für (for free = umsonst)", "لـ، من أجل (for free = مجانًا)"),
  free: g("свободный; бесплатный", "вільний; безкоштовний", "חופשי; חינם", "libre ; gratuit", "libre; gratis", "frei; kostenlos", "حر؛ مجاني", {
    note: "“For free” = without paying, just for joy.",
  }),
  // Words used only in the quiz answers.
  cat: g("кошка", "кішка", "חתול", "chat", "gato", "Katze", "قطة"),
  horse: g("лошадь", "кінь", "סוס", "cheval", "caballo", "Pferd", "حصان"),
  boy: g("мальчик, парень", "хлопчик, хлопець", "ילד, בחור", "garçon", "chico, niño", "Junge", "ولد، صبي"),
  grandma: g("бабушка", "бабуся", "סבתא", "mamie", "abuela", "Oma", "جدّة"),
  cold: g("холодный", "холодний", "קר", "froid", "frío", "kalt", "بارد"),
  blue: g("синий, голубой", "синій, блакитний", "כחול", "bleu", "azul", "blau", "أزرق"),
  who: g("кто, кого", "хто, кого", "מי, את מי", "qui", "quién, a quién", "wer, wen", "مَن"),
  what: g("что", "що", "מה", "quoi, qu'est-ce que", "qué", "was", "ماذا، ما"),
  did: g("(вспомогательный глагол прошедшего времени)", "(допоміжне дієслово минулого часу)", "(פועל עזר בעבר)", "(auxiliaire du passé)", "(auxiliar del pasado)", "(Hilfsverb der Vergangenheit)", "(فعل مساعد للماضي)", {
    lemma: "do",
    note: "Helper verb for past-tense questions: “Who did I meet?”",
  }),
  walk: g("выгуливать, гулять", "вигулювати, гуляти", "לטייל, ללכת", "promener", "pasear", "spazieren gehen, ausführen", "يتمشّى، يمشي"),
  meet: g("встречать, знакомиться", "зустрічати, знайомитися", "לפגוש", "rencontrer", "conocer, encontrar", "treffen, kennenlernen", "يقابل، يلتقي"),
};

export const demoSong: Song = {
  id: "down-to-the-sea",
  free: true,
  title: "Down to the Sea",
  artist: "Verso Demo",
  language: "en",
  speechLang: "en-US",
  level: "beginner",
  duration: lines[lines.length - 1].end + 1.5,
  lines,
  glossary,
  phrases: {
    "down to the sea": g("до самого моря", "аж до моря", "עד הים", "jusqu'à la mer", "hasta el mar", "bis zum Meer", "حتى البحر", {
      note: "“Down to” = all the way to (often downhill).",
    }),
    "smiled at": g("улыбнулось (кому-то)", "усміхнулося (комусь)", "חייך אל", "a souri à", "sonrió a", "lächelte (jemanden) an", "ابتسم لـ", {
      note: "Smile at someone: the sun is smiling at the singer.",
    }),
    "said hello": g("поздоровалась", "привіталася", "אמרה שלום", "a dit bonjour", "saludó", "sagte Hallo", "ألقت التحية", {
      note: "Say hello = greet someone.",
    }),
    "that's how": g("вот так; именно так", "ось так; саме так", "ככה; כך", "c'est comme ça que", "así es como", "so; genau so", "هكذا؛ بهذه الطريقة", {
      note: "“That's how + sentence” = this is the way that…",
    }),
    "for free": g("бесплатно; просто так, для души", "безкоштовно; просто так", "בחינם; סתם כך", "gratuitement ; pour le plaisir", "gratis; por gusto", "umsonst; einfach aus Freude", "مجانًا؛ لمجرد المتعة", {
      note: "Idiom: without paying — here, just for the joy of it.",
    }),
  },
  quiz: [
    {
      kind: "picture",
      question: "Who did I walk down to the sea?",
      translations: {
        ru: "Кого я выгулял до моря?",
        uk: "Кого я вигуляв до моря?",
        he: "עם מי הלכתי עד לים?",
        fr: "Qui ai-je promené jusqu'à la mer ?",
        es: "¿A quién paseé hasta el mar?",
        de: "Wen habe ich zum Meer ausgeführt?",
        ar: "مَن الذي تمشّيتُ معه حتى البحر؟",
      },
      choices: [
        { emoji: "🐱", word: "cat" },
        { emoji: "🐶", word: "dog", correct: true },
        { emoji: "🐴", word: "horse" },
      ],
    },
    {
      kind: "picture",
      question: "Who did I meet?",
      translations: {
        ru: "Кого я встретил?",
        uk: "Кого я зустрів?",
        he: "את מי פגשתי?",
        fr: "Qui ai-je rencontré ?",
        es: "¿A quién conocí?",
        de: "Wen habe ich getroffen?",
        ar: "مَن قابلتُ؟",
      },
      choices: [
        { emoji: "👦", word: "boy" },
        { emoji: "👵", word: "grandma" },
        { emoji: "👧", word: "girl", correct: true },
      ],
    },
    { kind: "fill", line: 1, answer: "warm", options: ["cold", "warm", "blue"] },
    { kind: "order", line: 2 },
    {
      kind: "choice",
      question: "What was new to me?",
      translations: {
        ru: "Что было для меня новым?",
        uk: "Що було для мене новим?",
        he: "מה היה חדש לי?",
        fr: "Qu'est-ce qui était nouveau pour moi ?",
        es: "¿Qué era nuevo para mí?",
        de: "Was war neu für mich?",
        ar: "ما الذي كان جديدًا عليّ؟",
      },
      choices: [{ text: "the sea" }, { text: "every word", correct: true }, { text: "the dog" }],
    },
  ],
};

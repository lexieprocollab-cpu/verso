// Verso's picture library for picture questions. The AI may only choose from
// these keys, so every picture is predictable, free and suitable for all ages.
// Emoji for now; a Verso illustration set can replace them key by key.

export const PICTURES = {
  // people
  man: "👨",
  woman: "👩",
  boy: "👦",
  girl: "👧",
  baby: "👶",
  grandma: "👵",
  grandpa: "👴",
  "two-boys": "👬",
  "two-girls": "👭",
  couple: "👫",
  family: "👪",
  friends: "🧑‍🤝‍🧑",
  singer: "🧑‍🎤",
  dancer: "💃",
  teacher: "🧑‍🏫",
  doctor: "🧑‍⚕️",
  // animals
  dog: "🐶",
  cat: "🐱",
  horse: "🐴",
  bird: "🐦",
  fish: "🐟",
  cow: "🐮",
  lion: "🦁",
  bear: "🐻",
  rabbit: "🐰",
  butterfly: "🦋",
  // nature and places
  sun: "☀️",
  moon: "🌙",
  star: "⭐",
  rain: "🌧️",
  snow: "❄️",
  sea: "🌊",
  mountain: "⛰️",
  tree: "🌳",
  flower: "🌸",
  fire: "🔥",
  house: "🏠",
  city: "🏙️",
  school: "🏫",
  beach: "🏖️",
  night: "🌃",
  road: "🛣️",
  // things
  car: "🚗",
  train: "🚆",
  plane: "✈️",
  boat: "⛵",
  phone: "📱",
  book: "📖",
  guitar: "🎸",
  piano: "🎹",
  microphone: "🎤",
  music: "🎵",
  heart: "❤️",
  "broken-heart": "💔",
  kiss: "💋",
  ring: "💍",
  money: "💰",
  gift: "🎁",
  clock: "⏰",
  key: "🔑",
  letter: "✉️",
  // food and drink
  coffee: "☕",
  wine: "🍷",
  bread: "🍞",
  apple: "🍎",
  cake: "🎂",
  // actions and feelings
  happy: "😀",
  sad: "😢",
  angry: "😠",
  love: "🥰",
  scared: "😨",
  tired: "😴",
  laugh: "😂",
  dance: "🕺",
  run: "🏃",
  walk: "🚶",
  swim: "🏊",
  sleep: "🛌",
  eat: "🍽️",
  cry: "😭",
  sing: "🎶",
  party: "🎉",
} as const;

export type PictureKey = keyof typeof PICTURES;

export const PICTURE_KEYS = Object.keys(PICTURES) as PictureKey[];

export function isPictureKey(value: string): value is PictureKey {
  return value in PICTURES;
}

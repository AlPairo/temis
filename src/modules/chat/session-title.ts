const MAX_TITLE_CHARS = 60;
const MAX_TITLE_WORDS = 6;
const DEFAULT_SESSION_TITLE = "Nueva sesi\u00f3n";

const STOP_WORDS = new Set([
  "necesito",
  "ayuda",
  "quiero",
  "hola",
  "buenas",
  "por",
  "favor",
  "puedes",
  "puede",
  "me",
  "sobre",
  "del",
  "de",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una"
]);

const cleanText = (input: string): string =>
  input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/[#>*_~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const trimPunctuation = (value: string): string =>
  value.replace(/^[\s:;,.!?\u00a1\u00bf()\-]+|[\s:;,.!?\u00a1\u00bf()\-]+$/g, "").trim();

const sentenceFragment = (value: string): string => {
  const first = value.split(/[.!?\n\r]/).map((p) => p.trim()).find(Boolean);
  return first ?? value;
};

const maybeTitleCase = (value: string): string => {
  if (value !== value.toLowerCase()) {
    return value;
  }
  return value
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
};

export function buildSessionTitleFromFirstMessage(input: string): string {
  const cleaned = sentenceFragment(cleanText(input));
  if (!cleaned) {
    return DEFAULT_SESSION_TITLE;
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let titleTokens = tokens;

  while (titleTokens.length > 0) {
    const headToken = trimPunctuation(titleTokens[0]).toLowerCase();
    if (!headToken || !STOP_WORDS.has(headToken)) {
      break;
    }
    titleTokens = titleTokens.slice(1);
  }

  if (titleTokens.length === 0) {
    titleTokens = tokens;
  }

  let title = trimPunctuation(titleTokens.slice(0, MAX_TITLE_WORDS).join(" "));
  if (!title) {
    title = DEFAULT_SESSION_TITLE;
  }
  if (title.length > MAX_TITLE_CHARS) {
    title = trimPunctuation(title.slice(0, MAX_TITLE_CHARS));
  }
  if (!title) {
    title = DEFAULT_SESSION_TITLE;
  }

  return maybeTitleCase(title);
}

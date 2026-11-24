/**
 * Deterministic German writing checker.
 *
 * Runs in the browser (instant, while typing) and on the server (merged with the optional AI check).
 * Design rule: a rule only fires when a mistake is practically certain. A missed error is cheap, a wrong
 * accusation destroys the learner's trust. Every rule has a test in scripts/test-german-check.mjs.
 */

export type Level = "A1" | "A2" | "B1" | "B2";

export type Issue = {
  /** Stable rule id, also the key in the learner's error diary. */
  rule: string;
  category: "Satzbau" | "Kasus" | "Rechtschreibung" | "Zeichensetzung" | "Perfekt" | "Groß-/Kleinschreibung" | "Stil";
  /** Character offsets into the checked text. */
  start: number;
  end: number;
  original: string;
  /** Suggested replacement for [start, end); absent when the learner has to restructure the sentence. */
  replacement?: string;
  message: { de: string; fa: string; en: string };
  /** Grammar module (lib/content/german-a1b2/curriculum.ts) that trains this mistake. */
  moduleId?: string;
  source: "rules" | "ai";
};

type Draft = Omit<Issue, "source" | "original"> & { original?: string };

const LETTER = "A-Za-zÄÖÜäöüß";
const PRONOUN = "ich|du|er|sie|es|wir|ihr|man";
/** Finite forms that are never also a plain infinitive ("wir arbeiten" must not match), plus auxiliaries/modals. */
const FINITE = [
  "bin", "bist", "ist", "sind", "seid", "war", "waren", "habe", "hast", "hat", "haben", "habt", "hatte", "hatten",
  "kann", "kannst", "k\u00f6nnen", "k\u00f6nnt", "muss", "musst", "m\u00fcssen", "will", "willst", "wollen", "wollt",
  "soll", "sollst", "sollen", "sollt", "darf", "darfst", "d\u00fcrfen", "werde", "wirst", "wird", "wurde", "wurden",
  "gehe", "gehst", "geht", "komme", "kommst", "kommt", "mache", "machst", "macht", "arbeite", "arbeitest", "arbeitet",
  "lerne", "lernst", "lernt", "wohne", "wohnst", "wohnt", "brauche", "brauchst", "braucht", "m\u00f6chte", "m\u00f6chtest",
  "finde", "findest", "findet",
].join("|");

/** Unambiguous nouns that learners often write in lower case. Words that are also verb forms (essen, frage, ...) are left out on purpose. */
const NOUNS = [
  "haus", "auto", "zeit", "frau", "mann", "kind", "buch", "tisch", "stadt", "schule", "arbeit", "freund", "freundin", "wasser",
  "firma", "computer", "server", "netzwerk", "bus", "zug", "bahnhof", "wohnung", "geld", "woche", "monat", "jahr", "problem",
  "antwort", "lehrer", "lehrerin", "arzt", "brot", "hund", "katze", "familie", "straße", "land", "kurs", "ticket", "passwort",
  "fehler", "sprache", "termin", "büro", "kollege", "kollegin", "chef", "kunde", "kundin", "projekt", "system",
  "datei", "drucker", "bildschirm", "telefon", "handy", "email", "nachricht", "ergebnis", "anwendung", "wetter", "urlaub",
];
const ARTICLES = "der|die|das|dem|den|des|ein|eine|einen|einem|einer|eines|mein|meine|meinen|meinem|meiner|dein|deine|deinen|deinem|unser|unsere|unseren|unserem|kein|keine|keinen|keinem";

/** Frequent learner typos with their correct form. Only words that are wrong in every context. */
const TYPOS: Record<string, string> = {
  "n\u00e4hmlich": "n\u00e4mlich", "vorallem": "vor allem", "ausversehen": "aus Versehen", "dannach": "danach", "garnicht": "gar nicht",
  "garnichts": "gar nichts", "intressant": "interessant", "interesant": "interessant", "addresse": "Adresse", "standart": "Standard",
  "vieleicht": "vielleicht", "vielleich": "vielleicht", "bischen": "bisschen", "defintiv": "definitiv",
};

const ACC_PREP = "für|ohne|durch|gegen|um";
const DAT_ONLY_FORMS = "dem|einem|meinem|deinem|seinem|ihrem|unserem|keinem";
const DAT_PREP = "mit|nach|bei|seit|von|zu|aus";
const SEIN_PARTICIPLES = "gegangen|gekommen|geblieben|gewesen|aufgestanden|angekommen";
const HABEN_PARTICIPLES = "gearbeitet|gelernt|gegessen|gekauft|gespielt|gelesen|geschrieben";

export function checkGerman(text: string): Issue[] {
  const issues: Draft[] = [];
  const add = (draft: Draft) => issues.push(draft);
  const re = (source: string, flags = "giu") => new RegExp(source, flags);

  // 1. Verb must be last in dass/weil/obwohl clauses: "weil ich habe keine Zeit".
  for (const m of text.matchAll(re(`\\b(weil|dass|obwohl)\\s+(${PRONOUN})\\s+(${FINITE})\\s+(?=[${LETTER}]+)`))) {
    const start = m.index ?? 0;
    const after = text.slice(start + m[0].length);
    // The clause continues (more words before the next punctuation): the finite verb is in the wrong place.
    if (!/^[^.,;:!?\n]{2,}/u.test(after)) continue;
    const end = start + m[0].length + (after.match(/^[^.,;:!?\n]+/u)?.[0].length ?? 0);
    add({
      rule: "nebensatz-verbende", category: "Satzbau", start, end,
      message: {
        de: `Nach „${m[1]}“ steht das konjugierte Verb am Ende des Nebensatzes: „weil ich keine Zeit habe“, nicht „weil ich habe keine Zeit“.`,
        fa: `بعد از «${m[1]}» فعل صرف‌شده باید آخر جملهٔ پیرو بیاید: «weil ich keine Zeit habe» نه «weil ich habe keine Zeit».`,
        en: `After “${m[1]}” the conjugated verb goes to the end of the clause: “weil ich keine Zeit habe”, not “weil ich habe keine Zeit”.`,
      },
      moduleId: "nebensaetze",
    });
  }

  // 2. "das" instead of "dass" after verbs of thinking and saying.
  for (const m of text.matchAll(re(`\\b(glaube|denke|meine|weiß|weiss|hoffe|finde|sage|dachte|wusste|glaubt|meint|hofft|sagt)\\s*,\\s*(das)\\b`))) {
    const start = (m.index ?? 0) + m[0].length - 3;
    add({
      rule: "das-dass", category: "Rechtschreibung", start, end: start + 3, replacement: "dass",
      message: {
        de: "Nach Verben wie glauben, denken, wissen leitet „dass“ (mit zwei s) den Nebensatz ein. „Das“ ist Artikel oder Pronomen.",
        fa: "بعد از فعل‌هایی مثل glauben و denken و wissen باید «dass» با دو s بیاید. «das» معرف یا ضمیر است.",
        en: "After verbs like glauben, denken, wissen the clause starts with „dass“ (two s). „Das“ is an article or pronoun.",
      },
      moduleId: "nebensaetze",
    });
  }

  // 3. Case after prepositions.
  for (const m of text.matchAll(re(`\\b(${ACC_PREP})\\s+(${DAT_ONLY_FORMS})\\b`))) {
    const start = (m.index ?? 0) + m[1].length + 1;
    const word = m[2];
    add({
      rule: "akk-praeposition-dativ", category: "Kasus", start, end: start + word.length,
      replacement: word.replace(/em$/u, "en"),
      message: {
        de: `„${m[1]}“ steht immer mit dem Akkusativ. „${word}“ ist eine Dativform.`,
        fa: `«${m[1]}» همیشه با Akkusativ می‌آید. «${word}» شکل Dativ است.`,
        en: `“${m[1]}” always takes the accusative. “${word}” is a dative form.`,
      },
      moduleId: "akkusativ",
    });
  }
  for (const m of text.matchAll(re(`\\b(${DAT_PREP})\\s+(einen)\\b`))) {
    const start = (m.index ?? 0) + m[1].length + 1;
    add({
      rule: "dativ-praeposition-akkusativ", category: "Kasus", start, end: start + 5, replacement: "einem",
      message: {
        de: `„${m[1]}“ steht immer mit dem Dativ: „${m[1]} einem …“.`,
        fa: `«${m[1]}» همیشه با Dativ می‌آید: «${m[1]} einem …».`,
        en: `“${m[1]}” always takes the dative: “${m[1]} einem …”.`,
      },
      moduleId: "dativ",
    });
  }

  // 4. Perfect auxiliary: sein vs. haben.
  for (const m of text.matchAll(re(`\\b(habe|hast|hat|haben|habt)\\s+(?:[${LETTER}]+\\s+){0,2}(${SEIN_PARTICIPLES})\\b`))) {
    const aux = m[1];
    const sein = { habe: "bin", hast: "bist", hat: "ist", haben: "sind", habt: "seid" }[aux.toLowerCase() as "habe"];
    const start = m.index ?? 0;
    add({
      rule: "perfekt-sein", category: "Perfekt", start, end: start + aux.length, replacement: aux[0] === aux[0].toUpperCase() ? sein[0].toUpperCase() + sein.slice(1) : sein,
      message: {
        de: `„${m[2]}“ bildet das Perfekt mit „sein“ (Bewegung oder Zustandsänderung).`,
        fa: `«${m[2]}» ماضی نقلی را با «sein» می‌سازد (حرکت یا تغییر حالت).`,
        en: `“${m[2]}” forms the perfect with “sein” (movement or change of state).`,
      },
      moduleId: "zeiten",
    });
  }
  for (const m of text.matchAll(re(`\\b(ich|wir)\\s+(bin|sind)\\s+(?:[${LETTER}]+\\s+){0,2}(${HABEN_PARTICIPLES})\\b(?!\\s+worden)`))) {
    const aux = m[2];
    const start = (m.index ?? 0) + m[1].length + 1;
    add({
      rule: "perfekt-haben", category: "Perfekt", start, end: start + aux.length, replacement: aux.toLowerCase() === "bin" ? "habe" : "haben",
      message: {
        de: `„${m[3]}“ bildet das Perfekt mit „haben“.`,
        fa: `«${m[3]}» ماضی نقلی را با «haben» می‌سازد.`,
        en: `“${m[3]}” forms the perfect with “haben”.`,
      },
      moduleId: "zeiten",
    });
  }

  // 5. Age: "Ich habe 25 Jahre".
  for (const m of text.matchAll(re(`\\b(ich habe|du hast|er hat|sie hat|wir haben)\\s+(\\d{1,2})\\s+jahre(\\s+alt)?\\s*(?=[.!?,;]|$)`, "gimu"))) {
    const start = m.index ?? 0;
    const aux = m[1].toLowerCase();
    const fixed = { "ich habe": "ich bin", "du hast": "du bist", "er hat": "er ist", "sie hat": "sie ist", "wir haben": "wir sind" }[aux as "ich habe"];
    add({
      rule: "alter-sein", category: "Satzbau", start, end: start + m[0].trimEnd().length,
      replacement: `${m[1][0] === m[1][0].toUpperCase() ? fixed[0].toUpperCase() + fixed.slice(1) : fixed} ${m[2]} Jahre alt`,
      message: {
        de: "Das Alter sagt man mit „sein“: „Ich bin 25 Jahre alt.“",
        fa: "سن را با «sein» می‌گوییم: «Ich bin 25 Jahre alt.»",
        en: "Age is expressed with “sein”: “Ich bin 25 Jahre alt.”",
      },
    });
  }

  // 6. Missing comma before a subordinate clause.
  for (const m of text.matchAll(re(`([${LETTER}0-9])(\\s+)(dass|weil|obwohl)\\b`))) {
    const index = m.index ?? 0;
    const before = text.slice(0, index + 1);
    if (/\b(und|oder|sowie|als|so|ab|bis|seit|ohne|nur)$/iu.test(before)) continue;
    const start = index + 1;
    add({
      rule: "komma-nebensatz", category: "Zeichensetzung", start, end: start + m[2].length, replacement: `,${m[2]}`,
      message: {
        de: `Vor „${m[3]}“ steht ein Komma, weil ein Nebensatz beginnt.`,
        fa: `پیش از «${m[3]}» باید ویرگول بگذاریم؛ چون جملهٔ پیرو شروع می‌شود.`,
        en: `A comma goes before “${m[3]}” because a subordinate clause starts.`,
      },
      moduleId: "nebensaetze",
    });
  }

  // 7. Lower-case noun after an article.
  for (const m of text.matchAll(re(`\\b(${ARTICLES})\\s+(${NOUNS.join("|")})(?![${LETTER}])`))) {
    const word = m[2];
    if (word[0] !== word[0].toLowerCase()) continue;
    const start = (m.index ?? 0) + m[0].length - word.length;
    add({
      rule: "nomen-gross", category: "Groß-/Kleinschreibung", start, end: start + word.length, replacement: word[0].toUpperCase() + word.slice(1),
      message: {
        de: "Nomen schreibt man im Deutschen immer groß.",
        fa: "اسم‌ها در آلمانی همیشه با حرف بزرگ نوشته می‌شوند.",
        en: "Nouns are always capitalised in German.",
      },
    });
  }

  // 8. Sentence start in lower case.
  for (const m of text.matchAll(re(`(^|[.!?]\\s+)([a-zäöü][${LETTER}]*)`, "gu"))) {
    const word = m[2];
    const start = (m.index ?? 0) + m[1].length;
    // "z. B. wenn", "ca. zehn", "am 3. mai": a full stop after an abbreviation or ordinal does not end the sentence.
    if (/(?:^|\s)(?:[A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc]|bzw|usw|ca|etc|vgl|evtl|ggf|inkl|nr|tel|str)\.\s+$/iu.test(text.slice(0, start)) || /\d\.\s+$/u.test(text.slice(0, start))) continue;
    add({
      rule: "satzanfang-gross", category: "Groß-/Kleinschreibung", start, end: start + word.length, replacement: word[0].toUpperCase() + word.slice(1),
      message: {
        de: "Ein Satz beginnt mit einem Großbuchstaben.",
        fa: "هر جمله با حرف بزرگ شروع می‌شود.",
        en: "A sentence starts with a capital letter.",
      },
    });
  }

  // 9. Frequent typos (word boundary aware, case-insensitive).
  for (const [wrong, right] of Object.entries(TYPOS)) {
    for (const m of text.matchAll(re(`(?<![${LETTER}])${wrong}(?![${LETTER}])`))) {
      const start = m.index ?? 0;
      const fixed = m[0][0] === m[0][0].toUpperCase() && right[0] === right[0].toLowerCase() ? right[0].toUpperCase() + right.slice(1) : right;
      add({
        rule: "tippfehler", category: "Rechtschreibung", start, end: start + m[0].length, replacement: fixed,
        message: { de: `Richtig geschrieben: „${fixed}“.`, fa: `املای درست: «${fixed}».`, en: `Correct spelling: “${fixed}”.` },
      });
    }
  }

  // 10. Spacing: double spaces, space before punctuation, no space after comma, repeated word.
  for (const m of text.matchAll(/[ \t]{2,}/gu)) {
    const start = m.index ?? 0;
    add({ rule: "leerzeichen", category: "Zeichensetzung", start, end: start + m[0].length, replacement: " ", message: { de: "Ein Leerzeichen genügt.", fa: "یک فاصله کافی است.", en: "One space is enough." } });
  }
  for (const m of text.matchAll(/ +([,.;:!?])/gu)) {
    const start = m.index ?? 0;
    add({ rule: "leerzeichen", category: "Zeichensetzung", start, end: start + m[0].length, replacement: m[1], message: { de: "Vor Satzzeichen steht kein Leerzeichen.", fa: "قبل از علامت نگارشی فاصله نمی‌گذاریم.", en: "No space before punctuation." } });
  }
  for (const m of text.matchAll(re(`([${LETTER}]),([${LETTER}])`))) {
    const start = (m.index ?? 0) + 1;
    add({ rule: "leerzeichen", category: "Zeichensetzung", start, end: start + 1, replacement: ", ", message: { de: "Nach dem Komma folgt ein Leerzeichen.", fa: "بعد از ویرگول فاصله می‌گذاریم.", en: "A space follows the comma." } });
  }
  for (const m of text.matchAll(re(`(?<![${LETTER}])([${LETTER}]{2,})\\s+\\1(?![${LETTER}])`, "giu"))) {
    if (/^(das|die|der|den|sie|wir|so|haben)$/iu.test(m[1])) continue;   // legitimate repeats: "dass das das", "sie sie"
    const start = m.index ?? 0;
    add({ rule: "wortwiederholung", category: "Stil", start, end: start + m[0].length, replacement: m[1], message: { de: "Dieses Wort steht zweimal hintereinander.", fa: "این کلمه دو بار پشت سر هم آمده.", en: "This word appears twice in a row." } });
  }

  return finalize(text, issues);
}

/** Sorts, fills `original`, and removes issues that overlap an earlier one so highlights never nest. */
export function finalize(text: string, drafts: Array<Draft | Issue>): Issue[] {
  const sorted = [...drafts].filter((d) => d.start >= 0 && d.end > d.start && d.end <= text.length).sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Issue[] = [];
  let lastEnd = -1;
  for (const draft of sorted) {
    if (draft.start < lastEnd) continue;
    out.push({ ...draft, original: text.slice(draft.start, draft.end), source: "source" in draft ? draft.source : "rules" } as Issue);
    lastEnd = draft.end;
  }
  return out;
}

/** Applies every replacement that has one, right to left so offsets stay valid. */
export function applyFixes(text: string, issues: Issue[]): string {
  let result = text;
  for (const issue of [...issues].sort((a, b) => b.start - a.start)) {
    if (issue.replacement === undefined) continue;
    result = result.slice(0, issue.start) + issue.replacement + result.slice(issue.end);
  }
  return result;
}

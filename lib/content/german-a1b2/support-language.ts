import { useEffect, useMemo, useState } from "react";

/**
 * Support language for the German course.
 *
 * German is always the learning language. The support language decides in which
 * language explanations, translations and lesson summaries are shown; the German
 * original stays visible underneath as a subtitle. Texts come from two places:
 *  - the authored Persian fields in the course data (`…Fa`), and
 *  - overlay files in `content/german-i18n/<lang>.json`, keyed by a stable id
 *    (see `supportKey`). An overlay entry wins over the authored Persian text, so
 *    reviewed corrections can be shipped without touching the course data.
 */
export type SupportLang = "fa" | "en" | "de";

export const SUPPORT_LANGS: { id: SupportLang; native: string; dir: "rtl" | "ltr" }[] = [
  { id: "fa", native: "فارسی", dir: "rtl" },
  { id: "en", native: "English", dir: "ltr" },
  { id: "de", native: "Nur Deutsch", dir: "ltr" },
];

export type SupportOverlay = Record<string, string>;

const loaders: Record<Exclude<SupportLang, "de">, () => Promise<{ default: SupportOverlay }>> = {
  fa: () => import("@/content/german-i18n/fa.json"),
  en: () => import("@/content/german-i18n/en.json"),
};

/** Stable overlay keys. Changing a key orphans existing translations. */
export const supportKey = {
  questionTranslation: (questionId: string) => `q:${questionId}:t`,
  questionExplanation: (questionId: string) => `q:${questionId}:x`,
  moduleTitle: (moduleId: string) => `m:${moduleId}:title`,
  moduleSummary: (moduleId: string) => `m:${moduleId}:summary`,
  lessonIntro: (moduleId: string) => `l:${moduleId}:intro`,
  lessonTitle: (moduleId: string, section: number) => `l:${moduleId}:${section}:title`,
  lessonBody: (moduleId: string, section: number) => `l:${moduleId}:${section}:body`,
  lessonExample: (moduleId: string, section: number, example: number) => `l:${moduleId}:${section}:ex${example}`,
  writingPrompt: (taskId: string) => `w:${taskId}:p`,
  writingCheck: (taskId: string, item: number) => `w:${taskId}:c${item}`,
};

/** Small interface texts around the German content, per support language. */
const ui = {
  fa: {
    explanation: "توضیح فارسی", yourAnswer: "پاسخ تو", notRight: "این شکل در این جمله درست نیست.",
    tabs: { learn: "آموزش", practice: "تمرین", writing: "نوشتن", dictation: "دیکته", results: "نتیجه" },
    dashboardIntro: "یک دوره، بیست ماژول. هر ماژول صفحهٔ مستقل خودش را دارد: درس، تمرین، نوشتن، دیکته و نتیجه. پیشرفتت در حساب و مرورگر ذخیره می‌شود.",
    lessonHint: "توضیح هر بخش به فارسی آمده و متن آلمانی اصلی زیر آن است.",
    languageLabel: "زبان توضیح",
  },
  en: {
    explanation: "Explanation", yourAnswer: "Your answer", notRight: "This form is not correct in this sentence.",
    tabs: { learn: "Learn", practice: "Practice", writing: "Writing", dictation: "Dictation", results: "Results" },
    dashboardIntro: "One course, twenty modules. Each module has its own page: lesson, practice, writing, dictation and results. Your progress is saved in your account and browser.",
    lessonHint: "Each section is explained in English; the original German text is shown underneath.",
    languageLabel: "Explanation language",
  },
  de: {
    explanation: "Erklärung", yourAnswer: "Deine Antwort", notRight: "Diese Form passt in diesem Satz nicht.",
    tabs: { learn: "", practice: "", writing: "", dictation: "", results: "" },
    dashboardIntro: "",
    lessonHint: "Lies die deutschen Erklärungen; danach kannst du die Fragen ohne Hilfetext beantworten.",
    languageLabel: "Erklärungssprache",
  },
} satisfies Record<SupportLang, unknown>;

const STORAGE_KEY = "klybit-german-support-lang";
const isSupportLang = (value: unknown): value is SupportLang => value === "fa" || value === "en" || value === "de";

export type Support = {
  lang: SupportLang;
  dir: "rtl" | "ltr";
  setLang: (lang: SupportLang) => void;
  /** Support-language text for `key`, falling back to the authored Persian text. `null` = show German only. */
  text: (key: string, authoredFa?: string | null) => string | null;
  ui: (typeof ui)[SupportLang];
};

export function useSupportLanguage(): Support {
  const [lang, setLangState] = useState<SupportLang>("fa");
  const [overlay, setOverlay] = useState<SupportOverlay>({});

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the saved preference after the server render
      if (isSupportLang(saved)) setLangState(saved);
    } catch { /* storage unavailable: keep the default */ }
  }, []);

  useEffect(() => {
    let alive = true;
    if (lang === "de") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- German-only mode needs no overlay
      setOverlay({});
      return;
    }
    loaders[lang]().then((module) => { if (alive) setOverlay(module.default ?? {}); }).catch(() => { if (alive) setOverlay({}); });
    return () => { alive = false; };
  }, [lang]);

  return useMemo(() => ({
    lang,
    dir: lang === "fa" ? "rtl" : "ltr",
    setLang: (next: SupportLang) => {
      setLangState(next);
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    },
    text: (key: string, authoredFa?: string | null) => {
      if (lang === "de") return null;
      const value = overlay[key] ?? (lang === "fa" ? authoredFa ?? null : null);
      return value && value.trim() ? value : null;
    },
    ui: ui[lang],
  }), [lang, overlay]);
}

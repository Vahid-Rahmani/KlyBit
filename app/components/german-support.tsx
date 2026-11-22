"use client";

import { createContext, useContext, type ReactNode } from "react";
import { SUPPORT_LANGS, useSupportLanguage, type Support } from "@/lib/content/german-a1b2/support-language";

/** One explanation-language state for the whole grammar section, so the header switch and the lesson stay in sync. */
export const SupportContext = createContext<Support | null>(null);

export function SupportProvider({ children }: { children: ReactNode }) {
  const support = useSupportLanguage();
  return <SupportContext.Provider value={support}>{children}</SupportContext.Provider>;
}

const SHORT: Record<string, string> = { fa: "فا", en: "EN", de: "DE" };

/** Compact three-way switch that lives in the study header, next to the settings. */
export function SupportSwitch() {
  const s = useContext(SupportContext);
  if (!s) return null;
  return <div className="german-support-switch" role="group" aria-label={s.ui.languageLabel}>
    {SUPPORT_LANGS.map((item) => <button key={item.id} type="button" lang={item.id} title={item.native} aria-pressed={s.lang === item.id} onClick={() => s.setLang(item.id)}>{SHORT[item.id] ?? item.native}</button>)}
  </div>;
}

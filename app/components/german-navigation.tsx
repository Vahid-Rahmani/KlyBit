"use client";

import type { ReactNode } from "react";
import { ArrowLeft, BookOpen, FolderSearch, Home, Languages, Network, SpellCheck } from "lucide-react";

export type GermanNavKey = "hub" | "grammatik" | "it" | "grammar-cases" | "satztat" | "korrektur";

type Entry = { key: GermanNavKey | "home"; label: string; href: string; icon: ReactNode; group?: string };

/** The ONE place that lists the German section. Every German page renders this, nothing else builds a menu. */
const ENTRIES: Entry[] = [
  { key: "hub", label: "Heute", href: "/german", icon: <Home size={18} /> },
  { key: "grammatik", label: "Grammatik A1–B2", href: "/german/grammatik", icon: <Languages size={18} />, group: "Lernen" },
  { key: "it", label: "Deutsch für IT", href: "/german/it", icon: <BookOpen size={18} /> },
  { key: "korrektur", label: "Schreibwerkstatt", href: "/german/korrektur", icon: <SpellCheck size={18} />, group: "Üben" },
  { key: "grammar-cases", label: "Grammatik-Fälle", href: "/german/grammar-cases", icon: <FolderSearch size={18} /> },
  { key: "satztat", label: "Netzwerk-Fälle", href: "/german/satztat", icon: <Network size={18} /> },
  { key: "home", label: "Alle Lernpfade", href: "/", icon: <ArrowLeft size={18} />, group: "Mehr" },
];

export const GERMAN_LEVELS = ["A1", "A2", "B1", "B2"] as const;

/** Plain anchors on purpose: the framework's client Link throws on the deployed build (see commit 90e30d2). */
export function GermanNavigation({ active }: { active: GermanNavKey }) {
  return <nav className="simple-navigation german-nav" aria-label="Deutsch">
    {ENTRIES.map((entry) => <div key={entry.key} className="german-nav-item">
      {entry.group && <p className="german-nav-group">{entry.group}</p>}
      <a href={entry.href} aria-current={active === entry.key ? "page" : undefined}>{entry.icon}<span>{entry.label}</span></a>
      {entry.key === "grammatik" && <div className="german-nav-levels" role="group" aria-label="Grammatik nach Niveau">
        {GERMAN_LEVELS.map((level) => <a key={level} href={`/german/grammatik?level=${level}`}>{level}</a>)}
      </div>}
    </div>)}
  </nav>;
}

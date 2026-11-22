"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { AppBrand, StudyHeader } from "@/app/components/study-header";
import { GERMAN_LEVELS, GermanNavigation } from "@/app/components/german-navigation";
import { AccountPanel, AuthPanel } from "@/app/components/learning-views";
import { copy } from "@/lib/course-data";
import { grammarCurriculum, readyGrammarModules } from "@/lib/content/german-a1b2/curriculum";
import { germanLessons } from "@/lib/content/german-learning";
import { grammarMissions } from "@/lib/content/grammar-cases";
import { getGermanSummary, parseGermanProgress } from "@/lib/german-learning-engine";

type Stored = Record<string, unknown>;

/** Reads a saved progress blob without ever throwing: a damaged entry must not break the start page. */
function readJson(key: string): Stored | null {
  try {
    const raw = localStorage.getItem(key);
    const value = raw && raw.length < 1_000_000 ? JSON.parse(raw) : null;
    return value && typeof value === "object" ? value as Stored : null;
  } catch { return null; }
}

const totalQuestions = readyGrammarModules.reduce((sum, module) => sum + module.questions.length, 0);

function grammarProgress(userId: string) {
  const saved = readJson(`klybit-german-a1b2:v1:${userId}`);
  const modules = (saved?.modules ?? {}) as Record<string, { answers?: Record<string, unknown> }>;
  const answered = readyGrammarModules.reduce((sum, module) => sum + Object.keys(modules[module.id]?.answers ?? {}).length, 0);
  const active = typeof saved?.activeModuleId === "string" ? readyGrammarModules.find((module) => module.id === saved.activeModuleId) : undefined;
  return { answered, last: active ?? readyGrammarModules[0] };
}

function itProgress(userId: string) {
  const saved = readJson(`klybit-german:v1:${userId}`);
  const ids = germanLessons.map((lesson) => lesson.id);
  const restored = parseGermanProgress(saved?.progress, ids);   // same validator the lesson page uses
  return { touched: restored ? getGermanSummary(restored, ids, Date.now()).practicedLessons : 0 };
}

export default function GermanHubPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [language, setLanguage] = useState("");
  const [grammar, setGrammar] = useState({ answered: 0, last: readyGrammarModules[0] });
  const [it, setIt] = useState({ touched: 0 });

  useEffect(() => {
    let live = true;
    void fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
      const data = response.ok ? await response.json() as { user?: { id?: unknown } } : null;
      if (live && typeof data?.user?.id === "string") setUserId(data.user.id);
    }).catch(() => undefined).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!userId) return;
    setGrammar(grammarProgress(userId));
    setIt(itProgress(userId));
  }, [userId]);

  const signOut = async () => {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) return false;
    setUserId(null); setAccountOpen(false);
    return true;
  };

  if (loading) return <main className="study-app min-h-screen"><p className="p-8" role="status">Loading your learning account…</p></main>;
  if (!userId) return <main className="study-app min-h-screen"><div className="auth-required"><AuthPanel onClose={() => undefined} onAuthenticated={setUserId} /></div></main>;

  const started = grammar.answered > 0;
  return <main className="study-app german-app font-scale-content" style={{ "--wincraft-font-scale": fontScale } as CSSProperties}>
    <div className="app-shell german-shell">
      <aside className="app-sidebar"><AppBrand subtitle="Deutsch" /><GermanNavigation active="hub" /></aside>
      <section className="app-content german-content">
        <StudyHeader compact title="Heute" course="Deutsch" t={copy.en} fontScale={fontScale} onFontScale={setFontScale} translationLanguage={language} onTranslationLanguage={setLanguage} onAccount={() => setAccountOpen(true)} />
        <div className="german-hub">
          <a className="german-hub-resume" href={`/german/grammatik/${grammar.last.id}`}>
            <span><small>{started ? "Weiterlernen" : "Hier starten"}</small><strong lang="de">{grammar.last.title}</strong><em lang="fa" dir="rtl">{grammar.last.titleFa}</em></span>
            <ArrowRight size={22} aria-hidden="true" />
          </a>

          <h2 className="german-hub-heading">Deine Lernwege</h2>
          <div className="german-hub-paths">
            <a className="german-hub-card" href="/german/grammatik">
              <strong>Grammatik A1–B2</strong>
              <span>{readyGrammarModules.length} Module · {totalQuestions} Fragen</span>
              <progress max={totalQuestions || 1} value={grammar.answered} aria-label="Grammatik Fortschritt" />
              <small>{grammar.answered} beantwortet</small>
            </a>
            <a className="german-hub-card" href="/german/it">
              <strong>Deutsch für IT</strong>
              <span>{germanLessons.length} Lektionen · Tickets, Änderungen, E-Mails</span>
              <progress max={germanLessons.length} value={it.touched} aria-label="Deutsch für IT Fortschritt" />
              <small>{it.touched} geübt</small>
            </a>
            <a className="german-hub-card" href="/german/grammar-cases">
              <strong>Grammatik-Fälle</strong>
              <span>{grammarMissions.length} Missionen · Situation lesen, Satz bauen</span>
              <small lang="fa" dir="rtl">بازی جمله‌سازی</small>
            </a>
            <a className="german-hub-card" href="/german/satztat">
              <strong>Netzwerk-Fälle</strong>
              <span>Störung untersuchen, dann die Übergabe auf Deutsch schreiben</span>
              <small>SatzTat</small>
            </a>
          </div>

          <h2 className="german-hub-heading">Grammatik nach Niveau</h2>
          <div className="german-hub-levels" role="group" aria-label="Grammatik nach Niveau">
            {GERMAN_LEVELS.map((level) => <a key={level} href={`/german/grammatik?level=${level}`}><strong>{level}</strong><span>{grammarCurriculum.filter((module) => module.level.includes(level)).length} Module</span></a>)}
          </div>
        </div>
      </section>
    </div>
    {accountOpen && <AccountPanel onClose={() => setAccountOpen(false)} onSignOut={signOut} />}
  </main>;
}

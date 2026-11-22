"use client";

import { GermanNavigation } from "@/app/components/german-navigation";
import { useEffect, useState, type CSSProperties } from "react";

import { AppBrand, StudyHeader } from "@/app/components/study-header";

import { AccountPanel, AuthPanel } from "@/app/components/learning-views";
import { GoogleSubtitleProvider } from "@/app/components/google-translate";
import { SupportProvider, SupportSwitch } from "@/app/components/german-support";
import { GermanGrammarCourse } from "@/app/components/german-grammar-course";
import { copy } from "@/lib/course-data";

type GrammarShellProps =
  | { view: "dashboard"; moduleId?: never }
  | { view: "module"; moduleId: string };

export function GermanGrammarShell({ view, moduleId }: GrammarShellProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [language, setLanguage] = useState("");

  useEffect(() => {
    let live = true;
    void fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
      const data = response.ok ? await response.json() as { user?: { id?: unknown } } : null;
      if (live && typeof data?.user?.id === "string") setUserId(data.user.id);
    }).catch(() => undefined).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const signOut = async () => {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) return false;
    setUserId(null);
    setAccountOpen(false);
    return true;
  };

  if (loading) return <main className="study-app min-h-screen"><p className="p-8" role="status">Loading your learning account…</p></main>;
  if (!userId) return <main className="study-app min-h-screen"><div className="auth-required"><AuthPanel onClose={() => undefined} onAuthenticated={setUserId} /></div></main>;

  return <SupportProvider><GoogleSubtitleProvider language={language}>
    <main className="study-app german-app font-scale-content" style={{ "--wincraft-font-scale": fontScale } as CSSProperties}>
      <div className="app-shell german-shell">
        <aside className="app-sidebar">
          <AppBrand subtitle="Deutsch" />
          <GermanNavigation active="grammatik" />
        </aside>
        <section className="app-content german-content">
          <StudyHeader
            compact
            extra={<SupportSwitch />}
            title="Grammatik A1–B2"
            course="Deutsch"
            t={copy.en}
            fontScale={fontScale}
            onFontScale={setFontScale}
            translationLanguage={language}
            onTranslationLanguage={setLanguage}
            onAccount={() => setAccountOpen(true)}
          />
          <GermanGrammarCourse key={`${userId}:${view}:${moduleId ?? "dashboard"}`} userId={userId} view={view} initialModuleId={moduleId} />
        </section>
      </div>
      {accountOpen && <AccountPanel onClose={() => setAccountOpen(false)} onSignOut={signOut} />}
    </main>
  </GoogleSubtitleProvider></SupportProvider>;
}

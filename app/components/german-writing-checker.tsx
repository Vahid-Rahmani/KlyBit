"use client";

import { useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, CheckCheck, Eraser, Lightbulb, Sparkles, TriangleAlert } from "lucide-react";
import { SupportContext } from "@/app/components/german-support";
import { useSupportLanguage } from "@/lib/content/german-a1b2/support-language";
import { grammarCurriculum } from "@/lib/content/german-a1b2/curriculum";
import { applyFixes, checkGerman, type Issue, type Level } from "@/lib/german-check/rules";

const MAX_TEXT = 1_500;
const DRAFT_KEY = (userId: string) => `klybit-german-writing:v1:${userId}`;
const DIARY_KEY = (userId: string) => `klybit-german-errors:v1:${userId}`;
const LEVELS: Level[] = ["A1", "A2", "B1", "B2"];

const RULE_LABELS: Record<string, string> = {
  "nebensatz-verbende": "Verb am Ende im Nebensatz",
  "das-dass": "das oder dass",
  "akk-praeposition-dativ": "Präposition + Akkusativ",
  "dativ-praeposition-akkusativ": "Präposition + Dativ",
  "perfekt-sein": "Perfekt mit sein",
  "perfekt-haben": "Perfekt mit haben",
  "alter-sein": "Alter mit sein",
  "komma-nebensatz": "Komma vor Nebensatz",
  "nomen-gross": "Nomen großschreiben",
  "satzanfang-gross": "Satzanfang großschreiben",
  tippfehler: "Häufige Tippfehler",
  leerzeichen: "Leerzeichen und Satzzeichen",
  wortwiederholung: "Wort doppelt",
};

const EXAMPLES = [
  "Ich bleibe heute zu Hause, weil ich bin müde. Ich glaube, das er hat keine Zeit.",
  "Gestern habe ich nach Hause gegangen. Ich fahre mit einen Bus und arbeite für dem Chef.",
  "Ich habe 25 Jahre alt. Das ist das haus meiner Eltern, nähmlich sehr schön.",
];

type DiaryEntry = { count: number; label: string; moduleId?: string; last: number };
type Diary = Record<string, DiaryEntry>;
type Server = { aiAvailable: boolean };

function readDiary(userId: string): Diary {
  try {
    const raw = window.localStorage.getItem(DIARY_KEY(userId));
    const data = raw && raw.length < 200_000 ? JSON.parse(raw) as unknown : null;
    if (!data || typeof data !== "object") return {};
    const clean: Diary = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const entry = value as Partial<DiaryEntry>;
      if (typeof entry?.count === "number" && typeof entry.label === "string") clean[key] = { count: entry.count, label: entry.label, moduleId: typeof entry.moduleId === "string" ? entry.moduleId : undefined, last: Number(entry.last) || 0 };
    }
    return clean;
  } catch { return {}; }
}

const moduleTitle = (moduleId?: string) => grammarCurriculum.find((module) => module.id === moduleId)?.title;

export function GermanWritingChecker({ userId }: { userId: string }) {
  const own = useSupportLanguage();
  const provided = useContext(SupportContext);
  const s = provided ?? own;

  const [text, setText] = useState("");
  const [level, setLevel] = useState<Level>("B1");
  const [diary, setDiary] = useState<Diary>({});
  const [server, setServer] = useState<Server>({ aiAvailable: false });
  const [remote, setRemote] = useState<{ text: string; issues: Issue[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    let live = true;
    try {
      const saved = window.localStorage.getItem(DRAFT_KEY(userId));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the saved draft after the server render
      if (saved) setText(saved.slice(0, MAX_TEXT));
    } catch { /* storage unavailable */ }
    setDiary(readDiary(userId));
    loaded.current = true;
    void fetch("/api/german-check", { cache: "no-store" }).then(async (response) => {
      const data = response.ok ? await response.json() as { aiAvailable?: unknown } : null;
      if (live && data) setServer({ aiAvailable: data.aiAvailable === true });
    }).catch(() => undefined);
    return () => { live = false; };
  }, [userId]);

  useEffect(() => {
    if (!loaded.current) return;
    try { window.localStorage.setItem(DRAFT_KEY(userId), text); } catch { /* storage unavailable */ }
  }, [text, userId]);

  const deferred = useDeferredValue(text);
  const localIssues = useMemo(() => checkGerman(deferred), [deferred]);
  // AI results belong to the exact text they were computed for; any edit makes them stale and the instant rules take over again.
  const remoteFresh = remote !== null && remote.text === deferred;
  const issues = remoteFresh && remote ? remote.issues : localIssues;
  const stale = deferred !== text;

  const segments = useMemo(() => {
    const parts: Array<{ text: string; issue?: number }> = [];
    let cursor = 0;
    issues.forEach((issue, index) => {
      if (issue.start > cursor) parts.push({ text: deferred.slice(cursor, issue.start) });
      parts.push({ text: deferred.slice(issue.start, issue.end), issue: index });
      cursor = issue.end;
    });
    if (cursor < deferred.length) parts.push({ text: deferred.slice(cursor) });
    return parts;
  }, [issues, deferred]);

  const record = (found: Issue[]) => {
    if (!found.length) return;
    const next = { ...readDiary(userId) };
    for (const issue of found) {
      const previous = next[issue.rule];
      next[issue.rule] = {
        count: (previous?.count ?? 0) + 1,
        label: RULE_LABELS[issue.rule] ?? issue.category,
        moduleId: issue.moduleId ?? previous?.moduleId,
        last: Date.now(),
      };
    }
    try { window.localStorage.setItem(DIARY_KEY(userId), JSON.stringify(next)); } catch { /* storage unavailable */ }
    setDiary(next);
  };

  const check = async () => {
    const source = text;
    if (!source.trim()) { setNotice("Schreibe zuerst einen Text."); return; }
    setNotice(""); setBusy(true);
    let found = checkGerman(source);
    try {
      if (server.aiAvailable) {
        const response = await fetch("/api/german-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: source, level }) });
        const data = response.ok ? await response.json() as { issues?: Issue[]; aiUsed?: boolean } : null;
        if (data && Array.isArray(data.issues)) {
          found = data.issues;
          setRemote({ text: source, issues: data.issues });
          if (!data.aiUsed) setNotice("Die KI war gerade nicht erreichbar. Es gelten die Regeln.");
        } else if (response.status === 429) setNotice("Zu viele Prüfungen. Bitte kurz warten; die Regel-Prüfung läuft weiter.");
        else setNotice("Die KI-Prüfung ist fehlgeschlagen. Es gelten die Regeln.");
      }
      record(found);
      if (!found.length) setNotice("Keine Fehler gefunden. Beachte: Die Prüfung erkennt nicht jeden Fehler.");
    } catch { setNotice("Keine Verbindung. Die Regel-Prüfung im Browser läuft weiter."); record(found); }
    finally { setBusy(false); }
  };

  const fixOne = (index: number) => {
    const issue = issues[index];
    if (!issue || issue.replacement === undefined || stale) return;
    setText(text.slice(0, issue.start) + issue.replacement + text.slice(issue.end));
    setActive(null);
  };
  const fixAll = () => { if (!stale) setText(applyFixes(text, issues)); };

  const fixable = issues.filter((issue) => issue.replacement !== undefined).length;
  const diaryList = Object.entries(diary).sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last).slice(0, 6);
  const diaryTotal = Object.values(diary).reduce((sum, entry) => sum + entry.count, 0);
  const top = diaryList[0]?.[1];
  const supportMessage = (issue: Issue) => s.lang === "fa" ? issue.message.fa : s.lang === "en" ? issue.message.en : null;

  return <div className="gw">
    <section className="gw-main">
      <div className="gw-card gw-editor">
        <div className="gw-editor-head">
          <label htmlFor="gw-text" className="gw-title">Dein Text <small>متن آلمانی خود را بنویس</small></label>
          <div className="gw-level" role="group" aria-label="Niveau">
            {LEVELS.map((item) => <button key={item} type="button" aria-pressed={level === item} onClick={() => setLevel(item)}>{item}</button>)}
          </div>
        </div>
        <textarea id="gw-text" value={text} lang="de" dir="ltr" spellCheck={false} autoCapitalize="none" maxLength={MAX_TEXT} rows={7}
          placeholder="Schreibe hier 2–5 Sätze auf Deutsch. Fehler werden sofort markiert …" onChange={(event) => { setText(event.target.value); setNotice(""); setActive(null); }} />
        <div className="gw-actions">
          <button type="button" className="gw-primary" onClick={() => void check()} disabled={busy || !text.trim()}><Sparkles size={16} />{busy ? "Prüfe …" : server.aiAvailable ? "Mit KI prüfen & merken" : "Prüfen & merken"}</button>
          <button type="button" onClick={fixAll} disabled={!fixable || stale}><CheckCheck size={16} />Alle Korrekturen übernehmen ({fixable})</button>
          <button type="button" onClick={() => { setText(""); setRemote(null); setNotice(""); }} disabled={!text}><Eraser size={16} />Leeren</button>
          <span className="gw-count" aria-live="off">{text.length}/{MAX_TEXT}</span>
        </div>
        <p className="gw-privacy" role="note">{server.aiAvailable
          ? "Die Sofort-Prüfung läuft im Browser. Beim Klick auf „Mit KI prüfen“ wird dein Text an den eingestellten KI-Anbieter gesendet; schreibe keine privaten Daten."
          : "Alles läuft im Browser: dein Text wird nicht gesendet. Eine KI-Prüfung ist auf diesem Server noch nicht eingeschaltet."}</p>
        {notice && <p className="gw-notice" role="status"><TriangleAlert size={14} />{notice}</p>}
        {!text && <div className="gw-examples"><span>Zum Ausprobieren:</span>{EXAMPLES.map((example, index) => <button key={example} type="button" onClick={() => setText(example)}>Beispiel {index + 1}</button>)}</div>}
      </div>

      {deferred.trim() && <div className="gw-card" aria-label="Markierter Text">
        <h2 className="gw-h"><span>Markierter Text</span><em className={issues.length ? "is-bad" : "is-ok"}>{issues.length ? `${issues.length} Hinweis${issues.length === 1 ? "" : "e"}` : "Keine Hinweise"}</em></h2>
        <p className="gw-marked" lang="de" dir="ltr">{segments.map((part, index) => part.issue === undefined
          ? <span key={index}>{part.text}</span>
          : <mark key={index} className={`gw-mark gw-mark-${issues[part.issue].source}${active === part.issue ? " is-active" : ""}`} onClick={() => { setActive(part.issue ?? null); document.getElementById(`gw-issue-${part.issue}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }}>{part.text}</mark>)}</p>
      </div>}

      {issues.length > 0 && <ol className="gw-issues" aria-label="Korrekturen">
        {issues.map((issue, index) => {
          const support = supportMessage(issue);
          const title = moduleTitle(issue.moduleId);
          return <li key={`${issue.start}-${issue.rule}`} id={`gw-issue-${index}`} className={`gw-issue${active === index ? " is-active" : ""}`}>
            <div className="gw-issue-top">
              <span className="gw-chip">{issue.category}</span>
              {issue.source === "ai" && <span className="gw-chip gw-chip-ai">KI</span>}
              <span className="gw-change" lang="de" dir="ltr"><del>{issue.original}</del>{issue.replacement !== undefined && <><span aria-hidden="true">→</span><ins>{issue.replacement || "(streichen)"}</ins></>}</span>
            </div>
            {support && <p className="gw-why" lang={s.lang} dir={s.dir}>{support}</p>}
            <p className={support ? "gw-why-de" : "gw-why"} lang="de" dir="ltr">{issue.message.de}</p>
            <div className="gw-issue-actions">
              {issue.replacement !== undefined && <button type="button" onClick={() => fixOne(index)} disabled={stale}><Check size={14} />Übernehmen</button>}
              {title && <a href={`/german/grammatik/${issue.moduleId}`}><BookOpen size={14} />Üben: {title}</a>}
            </div>
          </li>;
        })}
      </ol>}
    </section>

    <aside className="gw-side" aria-label="Lernstand">
      <div className="gw-card">
        <h2 className="gw-h"><span>Dein Fehler-Tagebuch</span><em>{diaryTotal}</em></h2>
        {diaryList.length === 0
          ? <p className="gw-muted">Noch leer. Jede Prüfung merkt sich, welche Fehler bei dir häufig sind. Die Daten bleiben nur in diesem Browser.</p>
          : <ul className="gw-diary">{diaryList.map(([rule, entry]) => <li key={rule}>
              <span className="gw-diary-label">{entry.label}</span><b>{entry.count}×</b>
              <i aria-hidden="true"><i style={{ width: `${Math.max(8, Math.round((entry.count / (top?.count || 1)) * 100))}%` }} /></i>
              {moduleTitle(entry.moduleId) && <a href={`/german/grammatik/${entry.moduleId}`}>{moduleTitle(entry.moduleId)}</a>}
            </li>)}</ul>}
        {diaryList.length > 0 && <button type="button" className="gw-link" onClick={() => { try { window.localStorage.removeItem(DIARY_KEY(userId)); } catch { /* storage unavailable */ } setDiary({}); }}>Tagebuch löschen</button>}
      </div>
      <div className="gw-card">
        <h2 className="gw-h"><span><Lightbulb size={14} /> So arbeitest du damit</span></h2>
        <ol className="gw-steps">
          <li>Schreibe 2–5 eigene Sätze zu einem Thema aus deinem Alltag oder der IT.</li>
          <li>Lies jede Markierung, bevor du „Übernehmen“ klickst. Verstehen schlägt Abnicken.</li>
          <li>Übe den Fehler mit dem verlinkten Modul, dann schreibe denselben Text neu.</li>
        </ol>
        <p className="gw-muted">Die Regel-Prüfung meldet nur sichere Fehler und erkennt nicht alles. Kein Hinweis heißt nicht automatisch „fehlerfrei“.</p>
      </div>
    </aside>
  </div>;
}

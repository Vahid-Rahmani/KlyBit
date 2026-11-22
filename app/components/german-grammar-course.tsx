"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- The vinext Link router throws on the deployed build; plain anchors keep these grammar routes usable. */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Award, BookOpen, Check, ChevronLeft, ChevronRight,
  CircleHelp, Flag, Headphones, Languages, LockKeyhole,
  PenLine, RotateCcw, Save, Sparkles, Volume2, X,
} from "lucide-react";
import { grammarCurriculum, grammarModuleSpecs, legacyB1QuestionMap, readyGrammarModules, type CurriculumModule } from "@/lib/content/german-a1b2/curriculum";
import { zuInfinitivDictation, zuInfinitivWritingTasks } from "@/lib/content/german-a1b2/index";
import { dictationForLesson, practiceForModule, writingTasksForLesson } from "@/lib/content/german-a1b2/module-practice";
import {
  createCourseState, emptyModuleProgress, isGrammarAnswerCorrect, normalizeGrammarAnswer,
  parseCourseState, type GrammarCourseState, type GrammarModuleProgress, type GrammarQuestion,
} from "@/lib/content/german-a1b2/types";
import { SUPPORT_LANGS, supportKey, useSupportLanguage, type Support } from "@/lib/content/german-a1b2/support-language";

const STORAGE_KEY = (userId: string) => `klybit-german-a1b2:v1:${userId}`;
const LEGACY_B1_KEY = (userId: string) => `klybit-german:b1:v1:${userId}`;
const MAX_DRAFT = 4000;
type Tab = "learn" | "practice" | "writing" | "dictation" | "results";
type ResultFilter = "all" | "wrong" | "difficult" | "open";

const tabs: { id: Tab; label: string; fa: string }[] = [
  { id: "learn", label: "Lernen", fa: "آموزش" },
  { id: "practice", label: "Üben", fa: "تمرین" },
  { id: "writing", label: "Schreiben", fa: "نوشتن" },
  { id: "dictation", label: "Diktat", fa: "دیکته" },
  { id: "results", label: "Ergebnisse", fa: "نتیجه" },
];

const formatLabels: Record<string, string> = {
  choice: "Auswahl",
  fill: "Lücke",
  order: "Satzbau",
};

const sameText = (left: string, right: string) => normalizeGrammarAnswer(left) === normalizeGrammarAnswer(right);

/** Support-language text first, German original underneath as a subtitle. Without support text only German is shown. */
function Dual({ de, support, s, className, heading = false }: { de: string; support: string | null; s: Support; className?: string; heading?: boolean }) {
  const Tag = heading ? "h4" : "p";
  if (!support) return <Tag className={className} lang="de" dir="ltr">{de}</Tag>;
  return <div className={`gg-dual${className ? ` ${className}` : ""}`}>
    <Tag className="gg-dual-main" lang={s.lang} dir={s.dir}>{support}</Tag>
    <Tag className="gg-dual-sub" lang="de" dir="ltr">{de}</Tag>
  </div>;
}

function LanguageSwitch({ s }: { s: Support }) {
  return <div className="gg-lang-switch" role="group" aria-label={s.ui.languageLabel}>
    <span className="gg-lang-label">{s.ui.languageLabel}</span>
    {SUPPORT_LANGS.map((item) => <button key={item.id} type="button" lang={item.id} dir={item.dir} aria-pressed={s.lang === item.id} onClick={() => s.setLang(item.id)}>{item.native}</button>)}
  </div>;
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="gg-stat"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

function FullExplanation({ question, correct, chosen, typed, s }: { question: GrammarQuestion; correct: boolean; chosen: number | null; typed: string | null; s: Support }) {
  const explanation = question.explanation;
  if (!explanation) return null;
  const selectedText = typed ?? (chosen === null ? null : question.options[chosen]);
  return <div className={`gg-feedback ${correct ? "is-correct" : "is-wrong"}`} role="status" aria-live="polite">
    <div className="gg-feedback-head">
      <strong>{correct ? "Richtig." : "Noch nicht."}</strong>
      <span>Lösung: <b lang="de" dir="ltr">{question.answer}</b></span>
    </div>
    {!correct && selectedText && <p className="gg-chosen" lang={s.lang} dir={s.dir}>{s.ui.yourAnswer}: <bdi lang="de" dir="ltr">{selectedText}</bdi> — {s.ui.notRight}</p>}
    {s.text(supportKey.questionExplanation(question.id), explanation.translationFa) && <section className="gg-fa-explanation" lang={s.lang} dir={s.dir}><h4>{s.ui.explanation}</h4><p>{s.text(supportKey.questionExplanation(question.id), explanation.translationFa)}</p></section>}
    <section><h4>Grammatische Regel</h4><p lang="de" dir="ltr">{explanation.rule}</p></section>
    <section><h4>Begründung</h4><p lang="de" dir="ltr">{explanation.reason}</p></section>
    <section><h4>Satzanalyse</h4><p lang="de" dir="ltr">{explanation.analysis}</p></section>
    <section><h4>Wortstellung</h4><p lang="de" dir="ltr">{explanation.wordOrder}</p></section>
    <section><h4>Formen und Kasus</h4><p lang="de" dir="ltr">{explanation.forms}</p></section>
    <section className="gg-error"><h4>Fehleranalyse</h4><p lang="de" dir="ltr">{explanation.error}</p></section>
    <section><h4>Zwei neue Beispiele</h4><ul lang="de" dir="ltr">{explanation.examples.map((example) => <li key={example}>{example}</li>)}</ul></section>
  </div>;
}

function ShortExplanation({ question, correct, chosen, typed, s }: { question: GrammarQuestion; correct: boolean; chosen: number | null; typed: string | null; s: Support }) {
  const short = question.shortExplanation;
  if (!short) return null;
  const selectedText = typed ?? (chosen === null ? null : question.options[chosen]);
  return <div className={`gg-feedback ${correct ? "is-correct" : "is-wrong"}`} role="status" aria-live="polite">
    <div className="gg-feedback-head">
      <strong>{correct ? "Richtig." : "Noch nicht."}</strong>
      <span>Lösung: <b lang="de" dir="ltr">{question.answer}</b></span>
    </div>
    {!correct && selectedText && <p className="gg-chosen" lang={s.lang} dir={s.dir}>{s.ui.yourAnswer}: <bdi lang="de" dir="ltr">{selectedText}</bdi></p>}
    <section className="gg-explain"><h4 lang={s.lang} dir={s.dir}>{s.ui.explanation}</h4><Dual de={short.de} support={s.text(supportKey.questionExplanation(question.id), short.fa)} s={s} /></section>
  </div>;
}

function Explanation({ question, correct, chosen, typed, s }: { question: GrammarQuestion; correct: boolean; chosen: number | null; typed: string | null; s: Support }) {
  return question.explanation
    ? <FullExplanation question={question} correct={correct} chosen={chosen} typed={typed} s={s} />
    : <ShortExplanation question={question} correct={correct} chosen={chosen} typed={typed} s={s} />;
}

function mergeLegacyB1Markers(state: GrammarCourseState, userId: string): GrammarCourseState {
  try {
    const raw = localStorage.getItem(LEGACY_B1_KEY(userId));
    if (!raw) return state;
    const saved = JSON.parse(raw) as { mistakes?: unknown };
    if (!Array.isArray(saved.mistakes)) return state;
    const modules = { ...state.modules };
    let changed = false;
    for (const oldId of saved.mistakes) {
      if (typeof oldId !== "string") continue;
      const mapped = legacyB1QuestionMap.get(oldId);
      if (!mapped) continue;
      const current = modules[mapped.moduleId] ?? emptyModuleProgress();
      if (current.difficult.includes(mapped.id)) continue;
      modules[mapped.moduleId] = { ...current, difficult: [...current.difficult, mapped.id] };
      changed = true;
    }
    return changed ? { ...state, modules, updatedAt: Date.now() } : state;
  } catch {
    return state;
  }
}

export function GermanGrammarCourse({ userId, initialModuleId, view = "module", onNavigate }: { userId: string; initialModuleId?: string; view?: "dashboard" | "module"; onNavigate?: (path: string) => void }) {
  const [state, setState] = useState<GrammarCourseState>(() => createCourseState(grammarModuleSpecs, initialModuleId ?? "infinitiv-zu"));
  const stateRef = useRef(state);
  const dirtyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [serverMode, setServerMode] = useState<"checking" | "server" | "browser">("checking");
  const [saveStatus, setSaveStatus] = useState("Fortschritt wird geladen …");
  const [tab, setTab] = useState<Tab>("learn");
  const s = useSupportLanguage();
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [reviewPos, setReviewPos] = useState(0);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [writingOpen, setWritingOpen] = useState<Record<string, boolean>>({});
  const [dictationChecked, setDictationChecked] = useState<Record<string, boolean>>({});
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [audioStatus, setAudioStatus] = useState("");
  const [typedDraft, setTypedDraft] = useState<{ id: string; value: string }>({ id: "", value: "" });
  const [levelFilter, setLevelFilter] = useState<"all" | "A1" | "A2" | "B1" | "B2">("all");
  const [query, setQuery] = useState("");
  useEffect(() => {  // deep link from the sidebar: /german/grammatik?level=B1
    const wanted = new URLSearchParams(window.location.search).get("level")?.toUpperCase();
    if (wanted === "A1" || wanted === "A2" || wanted === "B1" || wanted === "B2") setLevelFilter(wanted);
  }, []);
  const router = useRouter();

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      const key = STORAGE_KEY(userId);
      let local: GrammarCourseState | null = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw && raw.length < 700_000) local = parseCourseState(JSON.parse(raw), grammarModuleSpecs);
      } catch { local = null; }
      const hasWork = (module: GrammarModuleProgress | undefined) => Boolean(module && (Object.keys(module.answers).length || Object.keys(module.writing).length || Object.keys(module.dictation).length));
      if (local) {
        setState(local);
        if (hasWork(local.modules[initialModuleId ?? local.activeModuleId])) setTab("practice");
      }
      setReady(true);
      setSaveStatus(local ? "Lokaler Fortschritt geladen" : "Neuer Start");

      void fetch("/api/german-course", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        const data = await response.json() as { state?: unknown; stored?: boolean };
        if (!live) return;
        setServerMode("server");
        const remote = parseCourseState(data.state, grammarModuleSpecs);
        if (remote && data.stored && (!local || remote.updatedAt >= local.updatedAt)) {
          const merged = mergeLegacyB1Markers(remote, userId);
          setState(merged);
          if (hasWork(merged.modules[initialModuleId ?? merged.activeModuleId])) setTab("practice");
          setSaveStatus("Vom Konto geladen");
          if (merged !== remote) setDirty(true);
        } else if (local) {
          const merged = mergeLegacyB1Markers(local, userId);
          setState(merged);
          setDirty(true);
          setSaveStatus("Lokaler Fortschritt wird synchronisiert");
        } else {
          const merged = mergeLegacyB1Markers(stateRef.current, userId);
          setState(merged);
          if (merged !== stateRef.current) setDirty(true);
          setSaveStatus("Bereit · wird im Konto gespeichert");
        }
      }).catch(() => {
        if (!live) return;
        setServerMode("browser");
        setSaveStatus("Im Browser gespeichert · Server nicht erreichbar");
      }).finally(() => { if (live) setReady(true); });
    }, 0);
    return () => { live = false; window.clearTimeout(timer); };
  }, [userId, initialModuleId]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(state)); } catch { /* the server copy remains available */ }
  }, [state, ready, userId]);

  useEffect(() => {
    if (!ready || !dirty) return;
    const timer = window.setTimeout(async () => {
      const snapshot = stateRef.current;
      setSaveStatus("Speichert …");
      try {
        const response = await fetch("/api/german-course", {
          method: "PUT", headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: snapshot }),
        });
        if (!response.ok) throw new Error("unavailable");
        setServerMode("server");
        setSaveStatus("Gespeichert · Konto");
        if (stateRef.current.updatedAt === snapshot.updatedAt) setDirty(false);
      } catch {
        setServerMode("browser");
        setSaveStatus("Im Browser gespeichert · Server nicht erreichbar");
        if (stateRef.current.updatedAt === snapshot.updatedAt) setDirty(false);
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [state, dirty, ready]);

  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current) return;
      void fetch("/api/german-course", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: stateRef.current }), keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const update = () => setVoices(window.speechSynthesis.getVoices().filter((voice) => /^de(?:-|_)/i.test(voice.lang)));
    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => { window.speechSynthesis.removeEventListener("voiceschanged", update); window.speechSynthesis.cancel(); };
  }, []);

  useEffect(() => {
    if (!ready || !initialModuleId || stateRef.current.activeModuleId === initialModuleId) return;
    setState((current) => ({ ...current, activeModuleId: initialModuleId, updatedAt: Date.now() }));
    const saved = stateRef.current.modules[initialModuleId];
    setTab(saved && (Object.keys(saved.answers).length || Object.keys(saved.writing).length || Object.keys(saved.dictation).length) ? "practice" : "learn");
    setDirty(true);
  }, [ready, initialModuleId]);

  const requestedModule = grammarCurriculum.find((module) => module.id === (initialModuleId ?? state.activeModuleId));
  const activeModule = requestedModule?.status === "ready" ? requestedModule : readyGrammarModules[0];
  const moduleState = state.modules[activeModule.id] ?? emptyModuleProgress();
  const questions = activeModule.questions;
  const lesson = activeModule.lesson;
  const availableTabs = tabs;
  const authoredPractice = practiceForModule(activeModule.id);
  const writingTasks = activeModule.id === "infinitiv-zu" ? zuInfinitivWritingTasks : authoredPractice?.writing ?? (lesson ? writingTasksForLesson(lesson) : []);
  const dictationSentences = activeModule.id === "infinitiv-zu" ? zuInfinitivDictation : authoredPractice?.dictation ?? (lesson ? dictationForLesson(lesson) : []);

  const mutateModule = (updater: (current: GrammarModuleProgress) => GrammarModuleProgress) => {
    setState((current) => {
      const existing = current.modules[activeModule.id] ?? emptyModuleProgress();
      return { ...current, activeModuleId: activeModule.id, modules: { ...current.modules, [activeModule.id]: updater(existing) }, updatedAt: Date.now() };
    });
    setDirty(true);
  };

  const openModulePage = (module: CurriculumModule) => {
    if (module.status !== "ready") return;
    const nextState = { ...stateRef.current, activeModuleId: module.id, updatedAt: Date.now() };
    setState(nextState);
    setDirty(true);
    setReviewIds([]); setReviewPos(0); setTab("learn");
    setWritingOpen({}); setDictationChecked({}); setAudioStatus("");
    try { localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(nextState)); } catch { /* the next page still has the server copy */ }
    const target = `/german/grammatik/${module.id}`;
    if (onNavigate) onNavigate(target);
    else router.push(target);
  };

  const answeredCount = Object.keys(moduleState.answers).length;
  const correctCount = questions.filter((question) => isGrammarAnswerCorrect(question, moduleState.answers[question.id])).length;
  const wrongIds = questions.filter((question) => moduleState.answers[question.id] !== undefined && !isGrammarAnswerCorrect(question, moduleState.answers[question.id])).map((question) => question.id);
  const openCount = questions.length - answeredCount;
  const score = answeredCount ? Math.round((correctCount / answeredCount) * 100) : 0;
  const completed = answeredCount === questions.length && questions.length > 0;
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

  const overallTotal = readyGrammarModules.reduce((total, module) => total + module.questions.length, 0);
  const overallAnswered = readyGrammarModules.reduce((total, module) => total + Object.keys(state.modules[module.id]?.answers ?? {}).length, 0);
  const overallCorrect = readyGrammarModules.reduce((total, module) => total + module.questions.filter((question) => isGrammarAnswerCorrect(question, state.modules[module.id]?.answers[question.id])).length, 0);
  const overallWrong = overallAnswered - overallCorrect;
  const overallDifficult = readyGrammarModules.reduce((total, module) => total + (state.modules[module.id]?.difficult.length ?? 0), 0);
  const overallProgress = overallTotal ? Math.round((overallAnswered / overallTotal) * 1000) / 10 : 0;
  const overallScore = overallAnswered ? Math.round((overallCorrect / overallAnswered) * 100) : 0;
  const lastModule = grammarCurriculum.find((module) => module.id === state.activeModuleId && module.status === "ready") ?? readyGrammarModules[0];
  const needle = query.trim().toLowerCase();
  const visibleModules = grammarCurriculum.filter((module) => (levelFilter === "all" || module.level.includes(levelFilter))
    && (!needle || `${module.title} ${module.titleFa} ${module.summaryFa}`.toLowerCase().includes(needle)));

  const activeQuestion = questions[Math.min(moduleState.currentIndex, Math.max(0, questions.length - 1))] ?? questions[0];
  const reviewing = reviewIds.length > 0;
  const activeReviewQuestion = reviewing
    ? questions.find((question) => question.id === reviewIds[reviewPos]) ?? questions[0]
    : activeQuestion;
  const currentQuestion: GrammarQuestion = activeReviewQuestion ?? activeQuestion;
  const currentAnswer = moduleState.answers[currentQuestion.id];
  const currentAnswered = currentAnswer !== undefined;
  const currentCorrect = isGrammarAnswerCorrect(currentQuestion, currentAnswer);
  const currentChoice = typeof currentAnswer === "number" ? currentAnswer : null;
  const currentFormat = currentQuestion.format ?? "choice";
  const currentIsTyped = currentFormat === "fill" || currentFormat === "order";
  const currentIndex = questions.findIndex((question) => question.id === currentQuestion.id);
  const positionLabel = reviewing ? `${reviewPos + 1} / ${reviewIds.length}` : `${currentIndex + 1} / ${questions.length}`;
  const typed = typedDraft.id === currentQuestion.id ? typedDraft.value : (typeof currentAnswer === "string" ? currentAnswer : "");
  const setTyped = (value: string) => setTypedDraft({ id: currentQuestion.id, value });

  const selectAnswer = (index: number) => {
    if (currentAnswered || currentIsTyped || !currentQuestion) return;
    mutateModule((current) => ({ ...current, answers: { ...current.answers, [currentQuestion.id]: index } }));
  };
  const submitTyped = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!currentQuestion || currentAnswered || !typed.trim()) return;
    mutateModule((current) => ({ ...current, answers: { ...current.answers, [currentQuestion.id]: typed.slice(0, MAX_DRAFT) } }));
  };
  const clearAnswer = () => {
    if (!currentQuestion) return;
    mutateModule((current) => {
      const answers = { ...current.answers };
      delete answers[currentQuestion.id];
      return { ...current, answers };
    });
    setTyped("");
  };
  const goNext = () => {
    if (reviewing) {
      if (reviewPos + 1 < reviewIds.length) { setReviewPos((value) => value + 1); return; }
      setReviewIds([]); setReviewPos(0); setTab("results"); return;
    }
    if (currentIndex + 1 < questions.length) mutateModule((current) => ({ ...current, currentIndex: currentIndex + 1 }));
    else setTab("results");
  };
  const goPrevious = () => {
    if (reviewing) { setReviewPos((value) => Math.max(0, value - 1)); return; }
    mutateModule((current) => ({ ...current, currentIndex: Math.max(0, currentIndex - 1) }));
  };
  const goTo = (index: number) => {
    setReviewIds([]); setReviewPos(0);
    mutateModule((current) => ({ ...current, currentIndex: index }));
    setTab("practice");
  };
  const toggleDifficult = (id: string) => {
    mutateModule((current) => ({ ...current, difficult: current.difficult.includes(id) ? current.difficult.filter((item) => item !== id) : [...current.difficult, id] }));
  };
  const startReview = (ids: string[]) => {
    const next = Array.from(new Set(ids)).filter((id) => questions.some((question) => question.id === id));
    if (!next.length) return;
    setReviewIds(next); setReviewPos(0); setTab("practice");
  };
  const stopReview = () => { setReviewIds([]); setReviewPos(0); };
  const resetModule = () => {
    if (!window.confirm(`Nur Modul ${String(activeModule.number).padStart(2, "0")} zurücksetzen? Antworten, Markierungen und Entwürfe dieses Moduls werden gelöscht.`)) return;
    setState((current) => ({ ...current, modules: { ...current.modules, [activeModule.id]: emptyModuleProgress() }, updatedAt: Date.now() }));
    setDirty(true);
    setReviewIds([]); setReviewPos(0); setTab("learn");
    setWritingOpen({}); setDictationChecked({}); setAudioStatus("");
    setTypedDraft({ id: "", value: "" });
    setSaveStatus("Modul zurückgesetzt · wird gespeichert");
  };
  const updateWriting = (id: string, text: string) => mutateModule((current) => ({ ...current, writing: { ...current.writing, [id]: text.slice(0, MAX_DRAFT) } }));
  const updateDictation = (id: string, text: string) => mutateModule((current) => ({ ...current, dictation: { ...current.dictation, [id]: text.slice(0, MAX_DRAFT) } }));
  const speak = (text: string) => {
    if (!("speechSynthesis" in window) || !voices.length) { setAudioStatus("Keine deutsche Browserstimme verfügbar. Der Satz kann trotzdem geschrieben werden."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voices[0]; utterance.lang = "de-DE"; utterance.rate = 0.82;
    utterance.onerror = () => setAudioStatus("Audio nicht verfügbar. Nutze den Satz als Leseübung.");
    utterance.onend = () => setAudioStatus("Noch einmal hören, wenn nötig.");
    setAudioStatus("Deutsche Browserstimme spielt …");
    window.speechSynthesis.speak(utterance);
  };

  const resultQuestions = questions.filter((question) => {
    if (resultFilter === "wrong") return moduleState.answers[question.id] !== undefined && !isGrammarAnswerCorrect(question, moduleState.answers[question.id]);
    if (resultFilter === "difficult") return moduleState.difficult.includes(question.id);
    if (resultFilter === "open") return moduleState.answers[question.id] === undefined;
    return true;
  });

  const difficultQuestions = questions.filter((question) => moduleState.difficult.includes(question.id));

  if (!ready) return <p role="status">Loading your saved German practice…</p>;

  if (view === "dashboard") return <div className="gg-course gg-dashboard">
    <section className="gg-resume" aria-label="Weiterlernen">
      <div className="gg-resume-main">
        <p className="gg-resume-label">Weiterlernen</p>
        <a className="gg-primary" href={`/german/grammatik/${lastModule.id}`}>{lastModule.title}<ArrowRight size={16} /></a>
      </div>
      <div className="gg-resume-progress" aria-label={`${overallAnswered} von ${overallTotal} Fragen beantwortet, ${overallScore} Prozent richtig`}>
        <progress max={overallTotal || 1} value={overallAnswered} aria-hidden="true" />
        <span><b>{overallAnswered}</b>/{overallTotal} Fragen · <b>{overallScore}%</b> richtig{overallDifficult ? <> · <b>{overallDifficult}</b> schwierig</> : null}</span>
      </div>
      <LanguageSwitch s={s} />
    </section>

    <section className="gg-dash-panel" id="module" aria-label="Alle Module">
      <div className="gg-toolbar">
        <input type="search" className="gg-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Modul suchen · جست‌وجوی ماژول" aria-label="Modul suchen" />
        <div className="gg-filters gg-level-filter" role="group" aria-label="Nach Niveau filtern">
          {(["all", "A1", "A2", "B1", "B2"] as const).map((level) => <button key={level} type="button" aria-pressed={levelFilter === level} onClick={() => setLevelFilter(level)}>{level === "all" ? "Alle" : level}<small>{level === "all" ? grammarCurriculum.length : grammarCurriculum.filter((module) => module.level.includes(level)).length}</small></button>)}
        </div>
      </div>
      <p className="gg-count" role="status">{visibleModules.length} Module{levelFilter !== "all" ? ` · Niveau ${levelFilter}` : ""}{needle ? ` · „${query.trim()}“` : ""}</p>
      {!visibleModules.length && <p className="gg-empty">Kein Modul gefunden. Suche löschen oder „Alle“ wählen.</p>}
      <div className="gg-dash-grid">
        {visibleModules.map((module) => {
          const ready = module.status === "ready";
          const cardState = state.modules[module.id] ?? emptyModuleProgress();
          const cardAnswered = Object.keys(cardState.answers).length;
          const cardPercent = module.questions.length ? Math.round((cardAnswered / module.questions.length) * 100) : 0;
          const cardStatus = !ready ? "In Vorbereitung" : cardAnswered === module.questions.length ? "Abgeschlossen" : cardAnswered ? "Weiterlernen" : "Starten";
          const content = <>
            <div className="gg-dash-card-top">
              <span className="gg-dash-number">{String(module.number).padStart(2, "0")}</span>
              <span className={`gg-level gg-level-${module.level.slice(0, 2).toLowerCase()}`}>{module.level}</span>
            </div>
            <h3 lang="de" dir="ltr">{module.title}</h3>
            {s.text(supportKey.moduleTitle(module.id), module.titleFa) && <p className="gg-dash-fa" lang={s.lang} dir={s.dir}>{s.text(supportKey.moduleTitle(module.id), module.titleFa)}</p>}
            {s.text(supportKey.moduleSummary(module.id), module.summaryFa) && <p className="gg-dash-summary" lang={s.lang} dir={s.dir}>{s.text(supportKey.moduleSummary(module.id), module.summaryFa)}</p>}
            <div className="gg-dash-meta"><span>{ready ? `${module.questions.length} Fragen` : "Noch keine Fragen"}</span><span>{ready ? `${cardAnswered} beantwortet` : "Gesperrt"}</span></div>
            <progress max={100} value={ready ? cardPercent : 0} aria-label={`${module.title}: ${cardPercent}% bearbeitet`} />
            <div className="gg-dash-card-foot"><span>{cardStatus}</span>{ready ? <span>{cardPercent}% <ArrowRight size={13} /></span> : <LockKeyhole size={14} />}</div>
          </>;
          return ready
            ? <a key={module.id} className="gg-dash-card" href={`/german/grammatik/${module.id}`} aria-label={`Modul ${module.number}: ${module.title} öffnen`}>{content}</a>
            : <div key={module.id} className="gg-dash-card is-planned" aria-disabled="true">{content}</div>;
        })}
      </div>
    </section>
  </div>;

  if (!lesson || !questions.length) return <p role="status">Loading your saved German practice…</p>;

  return <div className="gg-course">
    <section className="gg-hero" aria-labelledby="gg-course-title">
      <div>
        <a className="gg-back" href="/german/grammatik"><ArrowLeft size={14} />Dashboard</a>
        <p className="gg-eyebrow">GRAMMATIK A1–B2 · MODUL {String(activeModule.number).padStart(2, "0")} VON 20</p>
        <h2 id="gg-course-title">{activeModule.title}</h2>
        <Dual className="gg-hero-dual" de={lesson.introDe} support={s.text(supportKey.lessonIntro(activeModule.id), lesson.introFa)} s={s} />
        <LanguageSwitch s={s} />
      </div>
      <div className="gg-hero-numbers" aria-label="Modulübersicht">
        <div><strong>{questions.length}</strong><span>Fragen</span></div>
        <div><strong>{lesson.sections.length}</strong><span>Themen</span></div>
        <div><strong>{activeModule.level}</strong><span>Niveau</span></div>
      </div>
    </section>

    <div className="gg-tabs" role="tablist" aria-label="Modulbereiche">
      {availableTabs.map((item) => <button key={item.id} type="button" role="tab" id={`gg-tab-${item.id}`} aria-selected={tab === item.id} aria-controls="gg-panel" onClick={() => setTab(item.id)}>
        <span>{item.label}</span>{s.ui.tabs[item.id] && <small lang={s.lang} dir={s.dir}>{s.ui.tabs[item.id]}</small>}
      </button>)}
    </div>

    <label className="gg-mobile-module"><span>Modul wählen</span><select aria-label="Modul wählen" value={activeModule.id} onChange={(event) => { const next = grammarCurriculum.find((module) => module.id === event.target.value); if (next) openModulePage(next); }}>
      {grammarCurriculum.map((module) => <option key={module.id} value={module.id} disabled={module.status !== "ready"}>{String(module.number).padStart(2, "0")} · {module.title}{module.status === "ready" ? ` · ${module.questionCount} Fragen` : " · noch nicht freigeschaltet"}</option>)}
    </select></label>

    <div className="gg-layout">
      <aside className="gg-modules" aria-label="20 Grammatikmodule">
        <div className="gg-side-heading"><h3><BookOpen size={16} />20 Module</h3><span>{readyGrammarModules.length} bereit</span></div>
        <p className="gg-module-note">Alle {readyGrammarModules.length} von 20 Modulen sind ausgearbeitet und freigeschaltet.</p>
        {grammarCurriculum.map((module) => <button key={module.id} className="gg-module-item" type="button" disabled={module.status !== "ready"} aria-current={module.id === activeModule.id ? "step" : undefined} onClick={() => openModulePage(module)}>
          <span className="gg-module-number">{String(module.number).padStart(2, "0")}</span>
          <span className="gg-module-title"><b>{module.title}</b>{s.text(supportKey.moduleTitle(module.id), module.titleFa) && <small lang={s.lang} dir={s.dir}>{s.text(supportKey.moduleTitle(module.id), module.titleFa)}</small>}</span>
          {module.status === "ready" ? <span className="gg-module-count">{module.questionCount}</span> : <LockKeyhole size={13} />}
        </button>)}
      </aside>

      <main id="gg-panel" className="gg-main" role="tabpanel" aria-labelledby={`gg-tab-${tab}`}>
        {tab === "learn" && <section className="gg-lesson">
          <div className="gg-section-heading"><p className="gg-eyebrow">SCHRITT 1 · VERSTEHEN</p><h3>Die Regel in {lesson.sections.length} Blickwinkeln</h3><p lang={s.lang === "de" ? "de" : s.lang} dir={s.dir}>{s.ui.lessonHint}</p></div>
          {lesson.sections.map((section, index) => <article key={section.titleDe} className="gg-lesson-card">
            <span className="gg-lesson-index">{String(index + 1).padStart(2, "0")}</span>
            <div><Dual heading de={section.titleDe} support={s.text(supportKey.lessonTitle(activeModule.id, index), section.titleFa)} s={s} /><Dual de={section.bodyDe} support={s.text(supportKey.lessonBody(activeModule.id, index), section.bodyFa)} s={s} /><ul className="gg-examples">{section.examples.map((example, exampleIndex) => { const translated = s.text(supportKey.lessonExample(activeModule.id, index, exampleIndex), section.examplesFa?.[exampleIndex]); return <li key={example}><span lang="de" dir="ltr">{example}</span>{translated && <span className="gg-example-fa" lang={s.lang} dir={s.dir}>{translated}</span>}</li>; })}</ul></div>
          </article>)}
          <div className="gg-callout"><CircleHelp size={18} /><div><strong>So wird bewertet</strong><p>Die Lösung erscheint erst nach deiner Auswahl. Richtig ist nur die Form, die im aktuellen Satz grammatisch und inhaltlich passt. Antworten, schwierige Markierungen und Entwürfe werden im Konto gespeichert; die Erklärung bleibt Teil jeder Frage.</p></div></div>
          <button type="button" className="gg-primary" onClick={() => setTab("practice")}><Sparkles size={16} />Mit Frage 1 beginnen</button>
        </section>}

        {tab === "practice" && currentQuestion && <section className="gg-question" aria-labelledby="gg-question-title">
          <div className="gg-question-top">
            <div><p className="gg-eyebrow">{reviewing ? "WIEDERHOLUNG" : "SCHRITT 2 · ANWENDEN"}</p><h3 id="gg-question-title">Frage {positionLabel}</h3></div>
            <div className="gg-question-badges"><span className={`gg-level gg-level-${currentQuestion.level.toLowerCase()}`}>{currentQuestion.level}</span><span className="gg-difficulty" aria-label={`Schwierigkeit ${currentQuestion.difficulty} von 3`}>{[1, 2, 3].map((step) => <i key={step} className={step <= currentQuestion.difficulty ? "is-on" : ""} />)}</span></div>
          </div>
          <div className="gg-progress-line"><span style={{ width: `${progress}%` }} /></div>
          {reviewing && <div className="gg-review-banner"><Languages size={16} /><span>Wiederholung: {reviewIds.length} falsche oder markierte Fragen.</span><button type="button" onClick={stopReview}><X size={14} />Beenden</button></div>}
          <p className="gg-prompt" lang="de" dir="ltr">{currentQuestion.prompt}</p>
          {s.text(supportKey.questionTranslation(currentQuestion.id), currentQuestion.translationFa) && <p className="gg-translation" lang={s.lang} dir={s.dir}>{s.text(supportKey.questionTranslation(currentQuestion.id), currentQuestion.translationFa)}</p>}
          <p className="gg-format-note">{formatLabels[currentFormat]} · {currentIsTyped ? (currentFormat === "order" ? "Bilde einen vollständigen Satz." : "Schreibe die fehlende Form.") : "Wähle genau eine Antwort."}</p>
          {currentIsTyped ? <form className="gg-typed-answer" onSubmit={submitTyped}>
            <label htmlFor="gg-typed-input">Deine Antwort auf Deutsch</label>
            <input id="gg-typed-input" className={currentAnswered ? currentCorrect ? "is-correct" : "is-wrong" : ""} lang="de" dir="ltr" translate="no" value={typed} onChange={(event) => setTyped(event.target.value)} disabled={currentAnswered} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={currentFormat === "order" ? "Schreibe den ganzen Satz …" : "Schreibe die fehlende Form …"} />
            <button type="submit" className="gg-primary" disabled={currentAnswered || !typed.trim()}>{currentAnswered ? "Antwort gespeichert" : "Antwort prüfen"}</button>
          </form> : <div className="gg-options" role="group" aria-label="Vier Antwortmöglichkeiten">
            {currentQuestion.options.map((option, index) => {
              const isCorrectOption = currentAnswered && index === currentQuestion.correctIndex;
              const isWrongChoice = currentAnswered && index === currentChoice && !currentCorrect;
              return <button key={option} type="button" disabled={currentAnswered} aria-pressed={currentChoice === index} className={isCorrectOption ? "is-correct" : isWrongChoice ? "is-wrong" : currentAnswered ? "is-muted" : ""} onClick={() => selectAnswer(index)}>
                <span className="gg-option-letter">{String.fromCharCode(65 + index)}</span>
                <span lang="de" dir="ltr">{option}</span>
                {isCorrectOption && <Check size={17} aria-label="richtige Antwort" />}
                {isWrongChoice && <X size={17} aria-label="falsche Antwort" />}
              </button>;
            })}
          </div>}
          {currentIsTyped && currentAnswered && <p className="gg-typed-result" role="status"><strong>{currentCorrect ? "Richtig." : "Noch nicht."}</strong> Richtig ist: <b lang="de" dir="ltr">{currentQuestion.answer}</b></p>}
          {!currentAnswered && <p className="gg-hint">Wähle eine Antwort. Erst danach werden Lösung, deutsche Kurzerklärung und persische Zusammenfassung sichtbar.</p>}
          {currentAnswered && <Explanation question={currentQuestion} correct={currentCorrect} chosen={currentChoice} typed={typeof currentAnswer === "string" ? currentAnswer : null} s={s} />}
          <div className="gg-question-actions">
            <button type="button" onClick={goPrevious} disabled={reviewing ? reviewPos === 0 : currentIndex === 0}><ChevronLeft size={15} />Zurück</button>
            <button type="button" onClick={goNext}>{reviewing && reviewPos + 1 >= reviewIds.length ? "Wiederholung beenden" : "Weiter"}<ChevronRight size={15} /></button>
            {currentAnswered && <button type="button" onClick={clearAnswer}><RotateCcw size={14} />Antwort löschen</button>}
            <button type="button" className={moduleState.difficult.includes(currentQuestion.id) ? "is-flagged" : ""} onClick={() => toggleDifficult(currentQuestion.id)}><Flag size={14} />{moduleState.difficult.includes(currentQuestion.id) ? "Markiert" : "Schwierig"}</button>
            <span className="gg-question-index">Nr. {currentIndex + 1}</span>
          </div>
        </section>}

        {tab === "writing" && <section className="gg-writing">
          <div className="gg-section-heading"><p className="gg-eyebrow">SCHRITT 3 · SCHREIBEN</p><h3>{activeModule.id === "infinitiv-zu" ? "Eigene Sätze mit zu + Infinitiv" : `Eigene Sätze: ${activeModule.title}`}</h3><p>Schreibe zuerst selbst. Die Musterlösung und die Checkliste erscheinen erst auf Knopfdruck; es gibt keine automatische Freitextnote.</p></div>
          {writingTasks.map((task, index) => <article key={task.id} className="gg-writing-card">
            <div className="gg-writing-head"><span>{String(index + 1).padStart(2, "0")}</span>{(() => { const prompt = s.text(supportKey.writingPrompt(task.id), task.promptFa); return prompt ? <p lang={s.lang} dir={s.dir}>{prompt}</p> : <p lang="fa" dir="rtl">{task.promptFa}</p>; })()}</div>
            <label htmlFor={`gg-write-${task.id}`}>Deine Antwort auf Deutsch</label>
            <textarea id={`gg-write-${task.id}`} lang="de" dir="ltr" value={moduleState.writing[task.id] ?? ""} maxLength={MAX_DRAFT} onChange={(event) => updateWriting(task.id, event.target.value)} rows={3} placeholder="Schreibe deinen Satz …" />
            <div className="gg-writing-actions"><button type="button" onClick={() => setWritingOpen((current) => ({ ...current, [task.id]: !current[task.id] }))}>{writingOpen[task.id] ? "Musterlösung verbergen" : "Musterlösung zeigen"}</button><span>{(moduleState.writing[task.id] ?? "").trim() ? `${(moduleState.writing[task.id] ?? "").trim().split(/\s+/u).length} Wörter` : "Noch kein Entwurf"}</span></div>
            {writingOpen[task.id] && <div className="gg-model"><p className="gg-model-label">Musterlösung</p><p lang="de" dir="ltr">{task.model}</p><ul lang={s.lang === "en" ? "en" : "fa"} dir={s.lang === "en" ? "ltr" : "rtl"}>{task.checklist.map((item, itemIndex) => <li key={item}>{(s.lang === "en" && s.text(supportKey.writingCheck(task.id, itemIndex))) || item}</li>)}</ul></div>}
          </article>)}
        </section>}

        {tab === "dictation" && <section className="gg-dictation">
          <div className="gg-section-heading"><p className="gg-eyebrow">SCHRITT 4 · HÖREN UND SCHREIBEN</p><h3>Diktat mit {dictationSentences.length} Sätzen</h3><p>Höre den Satz, schreibe ihn und vergleiche erst danach. Die Browserstimme ist keine Aufnahme einer Muttersprachlerin; ohne deutsche Stimme bleibt der Satz als Leseübung nutzbar.</p></div>
          {dictationSentences.map((sentence, index) => {
            const draft = moduleState.dictation[`d${index + 1}`] ?? "";
            const checked = dictationChecked[`d${index + 1}`] ?? false;
            const correct = checked && sameText(draft, sentence);
            return <article key={sentence} className={`gg-dictation-card${checked ? correct ? " is-correct" : " is-wrong" : ""}`}>
              <div className="gg-dictation-head"><span>{String(index + 1).padStart(2, "0")}</span><p>Diktat {index + 1}</p><button type="button" onClick={() => speak(sentence)} disabled={!voices.length}><Volume2 size={15} />Hören</button></div>
              <label htmlFor={`gg-dictation-${index}`}>Gehörten Satz schreiben</label>
              <textarea id={`gg-dictation-${index}`} lang="de" dir="ltr" value={draft} maxLength={MAX_DRAFT} onChange={(event) => updateDictation(`d${index + 1}`, event.target.value)} rows={2} placeholder="Schreibe den Satz …" />
              <div className="gg-dictation-actions"><button type="button" disabled={!draft.trim()} onClick={() => setDictationChecked((current) => ({ ...current, [`d${index + 1}`]: true }))}>Vergleichen</button><button type="button" onClick={() => { setDictationChecked((current) => ({ ...current, [`d${index + 1}`]: false })); updateDictation(`d${index + 1}`, ""); }}>Neu schreiben</button>{checked && <span className={correct ? "gg-ok" : "gg-no"}>{correct ? "Zeichen für Zeichen richtig." : "Noch nicht identisch."}</span>}</div>
              {checked && <div className="gg-dictation-model"><p>Musterlösung</p><p lang="de" dir="ltr">{sentence}</p></div>}
            </article>;
          })}
          <p className="gg-audio-status" role="status"><Headphones size={14} />{audioStatus || (voices.length ? `${voices.length} deutsche Browserstimme(n) verfügbar.` : "Keine deutsche Browserstimme gefunden; Diktat bleibt optional.")}</p>
        </section>}

        {tab === "results" && <section className="gg-results">
          <div className="gg-section-heading"><p className="gg-eyebrow">SCHRITT 5 · PRÜFEN</p><h3>Modul {String(activeModule.number).padStart(2, "0")}: dein Stand</h3><p>{completed ? `Alle ${questions.length} Fragen sind beantwortet. Die Zusammenfassung zeigt deinen tatsächlichen Stand, keine geschätzte Note.` : `Noch ${openCount} von ${questions.length} Fragen offen. Du kannst jederzeit unterbrechen; der Stand wird gespeichert.`}</p></div>
          <div className="gg-result-metrics"><Stat label="Beantwortet" value={`${answeredCount}/${questions.length}`} /><Stat label="Richtig" value={correctCount} /><Stat label="Quote" value={`${score}%`} /><Stat label="Schwierig" value={moduleState.difficult.length} /></div>
          {completed && <div className={`gg-completion ${score >= 80 ? "is-pass" : ""}`}><Award size={22} /><div><strong>{score >= 80 ? "Modul abgeschlossen · sicherer Stand" : "Modul abgeschlossen · weitere Wiederholung sinnvoll"}</strong><p>{score}% der beantworteten Fragen waren richtig. Das ist eine Lernstandsanzeige, kein Zertifikat und keine Prüfungsnote.</p></div></div>}
          <div className="gg-result-actions"><button type="button" className="gg-primary" onClick={() => startReview(wrongIds)} disabled={!wrongIds.length}><RotateCcw size={15} />Falsche üben ({wrongIds.length})</button><button type="button" onClick={() => startReview(moduleState.difficult)} disabled={!moduleState.difficult.length}><Flag size={15} />Markierte üben ({moduleState.difficult.length})</button><button type="button" onClick={() => { const next = questions.findIndex((question) => moduleState.answers[question.id] === undefined); if (next >= 0) goTo(next); }} disabled={!openCount}><ChevronRight size={15} />Nächste offene Frage</button></div>
          <div className="gg-filters" role="group" aria-label="Ergebnisse filtern">
            {([["all", `Alle ${questions.length}`], ["wrong", "Falsch"], ["difficult", "Schwierig"], ["open", "Offen"]] as [ResultFilter, string][]).map(([id, label]) => <button key={id} type="button" aria-pressed={resultFilter === id} onClick={() => setResultFilter(id)}>{label}</button>)}
          </div>
          <div className="gg-results-list">{resultQuestions.map((question) => {
            const answer = moduleState.answers[question.id];
            const status = answer === undefined ? "open" : isGrammarAnswerCorrect(question, answer) ? "correct" : "wrong";
            return <button key={question.id} type="button" className={`gg-result-row is-${status}`} onClick={() => goTo(questions.findIndex((item) => item.id === question.id))}>
              <span className="gg-result-number">{String(questions.findIndex((item) => item.id === question.id) + 1).padStart(3, "0")}</span>
              <span className="gg-result-copy"><b lang="de" dir="ltr">{question.prompt}</b><small>{question.level} · {question.explanation?.rule ?? question.shortExplanation?.de}</small></span>
              <span className="gg-result-status">{status === "correct" ? "Richtig" : status === "wrong" ? "Falsch" : "Offen"}</span>
              {moduleState.difficult.includes(question.id) && <Flag size={13} aria-label="schwierig markiert" />}
            </button>;
          })}</div>
        </section>}
      </main>

      <aside className="gg-side" aria-label="Fortschritt und Werkzeuge">
        <section className="gg-side-card">
          <div className="gg-side-heading"><h3><TargetIcon />Kursfortschritt</h3><span>{overallProgress}%</span></div>
          <progress max={100} value={overallProgress} aria-label="Kursfortschritt" />
          <div className="gg-side-stats"><span><b>{overallAnswered}</b> beantwortet</span><span><b>{overallTotal}</b> Fragen</span><span><b>{readyGrammarModules.length}</b> Module</span><span><b>{overallProgress}%</b> gesamt</span></div>
        </section>
        <section className="gg-side-card">
          <div className="gg-side-heading"><h3><TargetIcon />Modul {String(activeModule.number).padStart(2, "0")}</h3><span>{progress}%</span></div>
          <progress max={100} value={progress} aria-label="Beantwortete Fragen dieses Moduls" />
          <div className="gg-side-stats"><span><b>{answeredCount}</b> beantwortet</span><span><b>{correctCount}</b> richtig</span><span><b>{wrongIds.length}</b> falsch</span><span><b>{openCount}</b> offen</span></div>
        </section>
        <section className="gg-side-card">
          <div className="gg-side-heading"><h3><Save size={15} />Speichern</h3><span className={`gg-sync ${serverMode}`}>{serverMode === "server" ? "Konto" : serverMode === "checking" ? "Prüft" : "Browser"}</span></div>
          <p className="gg-save-status" role="status">{saveStatus}</p>
          <p className="gg-side-note">Antworten und Entwürfe werden nach jeder Änderung automatisch gespeichert. Beim erneuten Öffnen wird die letzte Frage des aktiven Moduls wiederhergestellt.</p>
        </section>
        <section className="gg-side-card">
          <div className="gg-side-heading"><h3><Flag size={15} />Wiederholen</h3><span>{wrongIds.length + moduleState.difficult.length}</span></div>
          <button type="button" className="gg-side-action" disabled={!wrongIds.length} onClick={() => startReview(wrongIds)}><RotateCcw size={14} />Falsche Antworten ({wrongIds.length})</button>
          <button type="button" className="gg-side-action" disabled={!moduleState.difficult.length} onClick={() => startReview(difficultQuestions.map((question) => question.id))}><Flag size={14} />Markierte Fragen ({moduleState.difficult.length})</button>
          <p className="gg-side-note">Die Wiederholung nutzt dieselben Prüfungen wie das Modul. Eine richtige Wiederholung löscht die ursprüngliche Antwort nicht.</p>
        </section>
        <section className="gg-side-card">
          <div className="gg-side-heading"><h3><PenLine size={15} />Entwürfe</h3><span>{Object.values(moduleState.writing).filter((text) => text.trim()).length + Object.values(moduleState.dictation).filter((text) => text.trim()).length}</span></div>
          <p className="gg-side-note">Schreib- und Diktatentwürfe werden mitgespeichert. Sie werden nicht automatisch benotet.</p>
        </section>
        <button type="button" className="gg-reset" onClick={resetModule}><RotateCcw size={14} />Nur dieses Modul zurücksetzen</button>
      </aside>
    </div>
  </div>;
}

function TargetIcon() {
  return <span className="gg-target-icon" aria-hidden="true">◎</span>;
}

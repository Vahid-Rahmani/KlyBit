// Validates the reviewed German-course overlays written by humans or agents:
//   content/german-i18n/<lang>.json      support-language texts (see support-language.ts)
//   content/german-quality/overrides.json removed / replaced questions
// Run: node --experimental-strip-types scripts/validate-german-overlays.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { grammarCurriculum, rawQuestionCount, rawQuestionModule } from "../lib/content/german-a1b2/curriculum.ts";

const root = new URL("../", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const PERSIAN = /[؀-ۿ]/u;
const errors = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);

// Every id that existed before quality changes, plus the current ids.
const rawOverrides = readJson("content/german-quality/overrides.json");
const modules = new Map(grammarCurriculum.map((module) => [module.id, module]));
const questionIds = new Set(grammarCurriculum.flatMap((module) => module.questions.map((question) => question.id)));
const removed = new Set(Object.keys(rawOverrides.remove ?? {}));
const replaced = new Set(Object.keys(rawOverrides.replace ?? {}));
const knownQuestion = (id) => questionIds.has(id) || removed.has(id) || replaced.has(id);

function checkKey(key) {
  let m;
  if ((m = key.match(/^q:(.+):(t|x)$/))) return knownQuestion(m[1]) || `unknown question ${m[1]}`;
  if ((m = key.match(/^m:([a-z0-9-]+):(title|summary)$/))) return modules.has(m[1]) || `unknown module ${m[1]}`;
  if ((m = key.match(/^l:([a-z0-9-]+):intro$/))) return Boolean(modules.get(m[1])?.lesson) || `unknown lesson ${m[1]}`;
  if ((m = key.match(/^l:([a-z0-9-]+):(\d+):(title|body|ex(\d+))$/))) {
    const section = modules.get(m[1])?.lesson?.sections[Number(m[2])];
    if (!section) return `unknown lesson section ${m[1]}:${m[2]}`;
    if (m[4] !== undefined && !section.examples[Number(m[4])]) return `unknown example ${m[4]}`;
    return true;
  }
  if (/^w:[A-Za-z0-9_-]+:(p|c\d+)$/.test(key)) return true;
  return "key does not match the documented key format";
}

const i18nDir = new URL("content/german-i18n/", root);
let i18nEntries = 0;
for (const file of readdirSync(i18nDir).filter((name) => name.endsWith(".json"))) {
  const lang = file.replace(/\.json$/, "");
  const data = readJson(`content/german-i18n/${file}`);
  if (typeof data !== "object" || Array.isArray(data) || data === null) { fail(file, "must be a JSON object"); continue; }
  for (const [key, value] of Object.entries(data)) {
    i18nEntries++;
    const where = `${file} ${key}`;
    const keyResult = checkKey(key);
    if (keyResult !== true) fail(where, keyResult);
    if (typeof value !== "string" || !value.trim()) { fail(where, "value must be a non-empty string"); continue; }
    if (value.length > 1600) fail(where, "value longer than 1600 characters");
    if (/<[a-z/][^>]*>/i.test(value)) fail(where, "HTML is not allowed");
    if (lang === "fa" && !PERSIAN.test(value)) fail(where, "Persian entry contains no Persian text");
    if (lang !== "fa" && PERSIAN.test(value)) fail(where, `${lang} entry contains Persian text`);
  }
}

const protectedModules = new Set(["infinitiv-zu"]); // authored module with fixed 100-question checks
const originalModule = (id) => rawQuestionModule.get(id);
for (const [id, reason] of Object.entries(rawOverrides.remove ?? {})) {
  if (typeof reason !== "string" || reason.trim().length < 8) fail(`remove ${id}`, "needs a reason (min. 8 characters)");
  if (replaced.has(id)) fail(`remove ${id}`, "cannot be removed and replaced");
}
for (const [id, next] of Object.entries(rawOverrides.replace ?? {})) {
  const where = `replace ${id}`;
  if (!next || typeof next !== "object") { fail(where, "replacement must be an object"); continue; }
  if (!new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-r\\d+$`).test(next.id ?? "")) fail(where, `replacement id must be "${id}-r<n>"`);
  if (typeof next.reason !== "string" || next.reason.trim().length < 8) fail(where, "needs a reason (min. 8 characters)");
  if (!rawQuestionModule.has(id)) fail(where, "unknown original question");
  if (!questionIds.has(next.id)) fail(where, "replacement did not appear in the curriculum");
  if (protectedModules.has(originalModule(id) ?? "")) fail(where, "this module is protected");
}
for (const id of removed) {
  if (!rawQuestionModule.has(id)) fail(`remove ${id}`, "unknown original question");
  if (protectedModules.has(originalModule(id) ?? "")) fail(`remove ${id}`, "this module is protected");
}
// Removed questions must really disappear; no module may lose more than 25% of its questions.
for (const module of grammarCurriculum) {
  for (const q of module.questions) if (removed.has(q.id)) fail(`remove ${q.id}`, "question is still present");
  const minimum = Math.ceil(rawQuestionCount(module.id) * 0.75);
  if (module.questions.length < minimum) fail(module.id, `only ${module.questions.length} questions left (minimum ${minimum})`);
}

if (errors.length) {
  console.error(`German overlays: ${errors.length} error(s)`);
  for (const error of errors.slice(0, 50)) console.error(`  - ${error}`);
  process.exit(1);
}
assert.ok(true);
console.log(`German overlays OK: ${i18nEntries} support-language entries, ${removed.size} removed and ${replaced.size} replaced questions.`);

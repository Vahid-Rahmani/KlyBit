// Evaluates the Schreibwerkstatt rules on a labelled set. Used by the section agent (klybit-agents/writing_scout.py).
// stdin : {"wrong":[{"text":"…","error":"exact wrong span","category":"…"}],"correct":["…"]}
// stdout: {"caught":[…],"missed":[…],"falsePositives":[{"text":"…","issues":[…]}]}
import { checkGerman } from "../lib/german-check/rules.ts";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));

const caught = [], missed = [], falsePositives = [];
for (const item of Array.isArray(input.wrong) ? input.wrong : []) {
  const issues = checkGerman(String(item.text));
  // A hit counts when an issue overlaps the span the agent says is wrong (or, without a span, when anything is reported).
  const at = item.error ? String(item.text).indexOf(String(item.error)) : -1;
  const hit = at >= 0 ? issues.some((i) => i.start < at + String(item.error).length && i.end > at) : issues.length > 0;
  (hit ? caught : missed).push({ ...item, rules: issues.map((i) => i.rule) });
}
for (const text of Array.isArray(input.correct) ? input.correct : []) {
  const issues = checkGerman(String(text));
  if (issues.length) falsePositives.push({ text, issues: issues.map((i) => ({ rule: i.rule, original: i.original, replacement: i.replacement ?? null })) });
}
console.log(JSON.stringify({ caught, missed, falsePositives }));

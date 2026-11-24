import assert from "node:assert/strict";
import { checkGerman, applyFixes } from "../lib/german-check/rules.ts";

let groups = 0;
function test(name, fn) { fn(); console.log(`PASS ${name}`); groups++; }
const rules = (text) => checkGerman(text).map((i) => i.rule);
const fixed = (text) => applyFixes(text, checkGerman(text));

// Every sentence below must be flagged exactly with this rule, and the suggested fix must be clean again.
const WRONG = [
  ["Ich bleibe zu Hause, weil ich bin müde.", "nebensatz-verbende"],
  ["Ich glaube, dass er hat keine Zeit.", "nebensatz-verbende"],
  ["Wir bleiben, obwohl wir können nicht helfen.", "nebensatz-verbende"],
  ["Ich glaube, das er kommt.", "das-dass"],
  ["Ich fahre für dem Chef nach Berlin.", "akk-praeposition-dativ"],
  ["Er arbeitet ohne einem Plan.", "akk-praeposition-dativ"],
  ["Ich fahre mit einen Bus.", "dativ-praeposition-akkusativ"],
  ["Ich habe nach Hause gegangen.", "perfekt-sein"],
  ["Er hat gestern gekommen.", "perfekt-sein"],
  ["Ich bin Deutsch gelernt.", "perfekt-haben"],
  ["Ich habe 25 Jahre alt.", "alter-sein"],
  ["Ich bleibe zu Hause weil es regnet.", "komma-nebensatz"],
  ["Das ist das haus meiner Eltern.", "nomen-gross"],
  ["ich lerne Deutsch.", "satzanfang-gross"],
  ["Das ist nähmlich wichtig.", "tippfehler"],
  ["Ich  lerne Deutsch.", "leerzeichen"],
  ["Ich lerne Deutsch , jeden Tag.", "leerzeichen"],
  ["Ich ich lerne Deutsch.", "wortwiederholung"],
];

test("every known mistake is found by its rule", () => {
  for (const [text, rule] of WRONG) assert.ok(rules(text).includes(rule), `${rule} missing in: ${text}`);
});

test("the suggested corrections produce text without that mistake", () => {
  for (const [text, rule] of WRONG) {
    if (checkGerman(text).filter((i) => i.rule === rule).every((i) => i.replacement === undefined)) continue;
    assert.ok(!rules(fixed(text)).includes(rule), `${rule} still present after fix: ${fixed(text)}`);
  }
  assert.equal(fixed("Ich bin müde, weil ich keine Zeit habe und ich glaube, das er kommt."), "Ich bin müde, weil ich keine Zeit habe und ich glaube, dass er kommt.");
  assert.equal(fixed("Ich habe nach Hause gegangen."), "Ich bin nach Hause gegangen.");
  assert.equal(fixed("Ich habe 25 Jahre alt."), "Ich bin 25 Jahre alt.");
});

// Correct German must stay silent. These are the sentences that would destroy trust if flagged.
const CORRECT = [
  "Ich bleibe zu Hause, weil ich müde bin.",
  "Ich glaube, dass er keine Zeit hat.",
  "Wir wissen, dass wir arbeiten müssen.",
  "Er sagt, dass wir kommen können.",
  "Ich weiß, dass wir gehen wollen.",
  "Das Auto, das er gekauft hat, ist neu.",
  "Das Buch, das sie liest, ist spannend.",
  "Ich bin nach Hause gegangen.",
  "Wir haben gestern lange gearbeitet.",
  "Er hat das Auto gefahren.",
  "Ich habe 3 Jahre Erfahrung im Support.",
  "Das Passwort wurde geändert.",
  "Ich freue mich auf den Urlaub und ich bin froh.",
  "Was ist damit gemeint?",
  "Z. B. wenn der Server ausfällt, rufe ich an.",
  "Ich komme am 3. oder 4. Tag.",
  "Ich weiß, dass das das Problem ist.",
  "Das ist ein deutsch sprechender Kollege.",
  "Für den Chef habe ich ein Ticket erstellt.",
  "Ich fahre mit dem Bus zur Arbeit.",
  "Ich bin gekommen, obwohl es regnet.",
  "Wir sind schon da und sie haben keine Zeit.",
  "Ich habe gehört, dass er gekommen ist.",
];

test("correct German produces no issue", () => {
  for (const text of CORRECT) assert.deepEqual(checkGerman(text).map((i) => `${i.rule}:${i.original}`), [], text);
});

test("offsets, originals and ordering are consistent and never overlap", () => {
  const text = "ich glaube, das er hat 25 Jahre.  Wir  haben nach Hause gegangen weil ich bin müde.";
  const issues = checkGerman(text);
  assert.ok(issues.length >= 4);
  let last = 0;
  for (const issue of issues) {
    assert.equal(text.slice(issue.start, issue.end), issue.original);
    assert.ok(issue.start >= last, "issues must not overlap");
    last = issue.end;
    assert.ok(issue.message.de && issue.message.fa && issue.message.en, "all three languages are required");
  }
});

test("rules cannot hang on long hostile input", () => {
  const started = Date.now();
  checkGerman("weil ich ".repeat(2000) + "a  ".repeat(2000) + "ich ".repeat(3000));
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
});

console.log(`${groups} groups passed`);

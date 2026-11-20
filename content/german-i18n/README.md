# German course: support-language overlays

German is always the learning language. The learner picks an explanation language
(Persian, English or German only) in the module header; explanations are shown in that
language first, with the German original underneath.

- `fa.json` — reviewed corrections of the authored Persian texts (wins over the course data).
- `en.json` — English texts.

Keys (`lib/content/german-a1b2/support-language.ts` → `supportKey`):

| key | text |
| --- | --- |
| `q:<questionId>:t` | translation of the question sentence |
| `q:<questionId>:x` | explanation of the question |
| `m:<moduleId>:title` / `m:<moduleId>:summary` | module title / summary |
| `l:<moduleId>:intro` | lesson introduction |
| `l:<moduleId>:<section>:title` / `:body` / `:ex<n>` | lesson section title, body, example translation |
| `w:<taskId>:p` / `w:<taskId>:c<n>` | writing prompt / checklist item |

Quality changes (removed near-duplicates, harder replacements) live in
`content/german-quality/overrides.json`. Validate everything with
`npm run validate:german-overlays`.

# Paperwork

Read the notice, see what it asks for, check whether you likely qualify, fill the form from answers
you learned once, and draft the letter — **and nothing is ever submitted for you.**

> **Verify every detail against the official source before you submit. This is guidance and a draft,
> not legal advice.** The app says this on every screen, in every draft, and in every export.

- **Demo (the app itself):** https://drsamonline.github.io/app-paperwork/play/index.html
- **Landing page:** https://drsamonline.github.io/app-paperwork/
- **Release:** https://github.com/drsamonline/app-paperwork/releases/tag/app-latest
- **Plan row:** #10 of 37 in `drsamonline/forge` → `QUEUE/PLAN.json`
- **Specs absorbed:** `app-bureaucrat` (lead), `app-form-filler`
- **Licence:** PolyForm Noncommercial 1.0.0

## Status

| | |
|---|---|
| **Built** | Documents/dates/amounts/deadlines extracted from pasted text with a verbatim quote each; conditions read out of the document and put as questions; likely-eligible verdict with the deciding condition; three draft templates; learned form answers reused by label; local application tracking; verify line on every panel and export. |
| **Release** | Windows EXE, Android APK and Linux binary, built from this source by `app-builder` in CI. |
| **Not built** | **OCR** — the text is pasted, not photographed. **The LLM** that would explain a document in its own words: the app quotes your document instead, which is exactly why every line it shows can be found in what you pasted. |
| **Untested** | How the extraction performs on real Indian notices. The patterns were written against a realistic invented notice; a municipal circular with different phrasing will find fewer documents, and the app will say it found fewer rather than inventing them. Also untested: any browser other than the jsdom harness. |

## The Bureaucrat spec's "done means", counted

> "A pasted notice that names three required documents yields a checklist naming all three, and every
> date the app reports appears verbatim in the source text. A scheme the user plainly does not
> qualify for returns 'likely not eligible' with the reason. Every screen carries the 'verify against
> the official source' line, and the draft exports as an editable file."

| The spec says | The test |
|---|---|
| three documents, all three named | `documents()` returns exactly 3 and the names contain Aadhaar, residence and income certificate |
| every date verbatim in the source | each `dates()[].text` is asserted to be a substring of the pasted notice, and each carries a verbatim quote |
| plainly ineligible → likely not eligible, with the reason | verdict is `likely not eligible` and the reason names the income and quotes the condition |
| the verify line on every screen | three panels each carry it, the page fills each from `P.VERIFY`, and every export and every template contains it |
| the draft exports as an editable file | a `.txt` written through the writer, containing the documents from the notice |

## Two specs, one job

Bureaucrat *explains a paper you must deal with*; Form Filler *fills the paper*. Both are the same job
— **turn paperwork into something you can act on** — so one engine, one store, three tabs. Both
specs' must-not ("don't grow a second job") is asserted.

## What it will not do

- **Submit anything.** It fills fields and drafts letters; you press the button.
- **Guess a form it does not know.** A field with no learned answer stays visibly blank.
- **Pick between two answers.** Both are offered; you choose.
- **Judge a scheme it cannot read.** No condition found means no verdict, and it says so.
- **Invent an explanation.** No model: every document, date, amount and deadline is quoted from your text.
- **Link out to a portal it cannot reach.**

## When things go wrong

| Case | Behaviour |
|---|---|
| **Bad input** | Empty paste refused. No labels refused. No learned answer → blank, never a near-miss. No condition found → no verdict. |
| **No network** | Nothing changes; there is no portal link to break. |
| **Storage full or unavailable** | The answer or draft is not saved and the app says so at once — a half-filled form is never assumed safe. |
| **Corrupt saved state** | Reported and offered for export, never written over; a partial set loads with the missing labels named. |

## Why the quotes matter

Every document, date, amount, deadline and condition is shown **with the sentence it came from**, and
the sentence is a verbatim slice of what was pasted. That is the whole honesty of this app: there is
no model to ask "what does this notice mean", so instead it shows you the lines and lets you check
them. It also means the app cannot invent a requirement — if it did not find three documents, it says
it found two.

## Tests

```bash
npm test                      # all three suites
node tests/self-tests.js      # engine — 102 assertions, including the done-means
node tests/ui-tests.js        # the page in jsdom — 51 assertions (needs the dev-only jsdom)
node tests/page-smoke.js      # every local src/href resolves, nothing off-origin
```

Mutation-tested six ways on 25/11/2026, each a clean red: only one document reported (3 failures),
dates normalised instead of verbatim (2), unanswered conditions counted as met (2), the verify line
emptied (4), a near-miss label filled (7), a corrupt set becoming an empty one (2). Restored, 102/102.

## Layout

```
docs/index.html            landing page
docs/play/index.html       the app (Explain, Draft, Forms & tracking)
docs/play/app.js           DOM wiring: reading, conditions, verdict, drafts, learning, filling, tracking
docs/play/paperwork-core.js  the engine — extraction, conditions, eligibility, templates, forms, storage
docs/play/web-kit.js       vendored kit (unmodified)
docs/play/export-kit.js    vendored kit (unmodified)
tests/self-tests.js        engine suite (102)
tests/ui-tests.js          page suite (51, jsdom)
tests/page-smoke.js        shape on disk
PAGES.json                 landing = docs/index.html, app = docs/play/index.html
```

## Where the spec was silent, and what was chosen

- **Eligibility conditions are read from the document, not from a scheme database.** Inventing official thresholds would be the worst thing this app could do; reading the conditions the person can see, and quoting them, is the honest version.
- **"Likely", not "yes".** The verdict is computed from one document and the person's own answers, and says so every time.
- **Unanswered ≠ failed.** A half-answered eligibility check returns "not enough answered", naming what is missing.
- **Two answers are kept, not resolved.** A form asking for a name may legitimately have "as per Aadhaar" and "as per PAN" versions.
- **The verify line comes from one string in the engine**, so the page and the exports cannot drift apart.

## What is not built, and why

**OCR.** The prompt asks for on-device OCR; no vision model exists in this estate, so the text is
pasted.

**The LLM.** The prompt is built around a bring-your-own-key model that explains a document in plain
language. The house rules forbid a runtime network call. What replaced it is not a worse
explanation — it is a different claim: the app quotes your document and shows you where each line
came from, so you can check it. That is why the spec's own requirement ("every date the app reports
appears verbatim in the source text") is satisfiable at all here, and why it is asserted.

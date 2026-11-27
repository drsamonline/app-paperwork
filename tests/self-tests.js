#!/usr/bin/env node
/* self-tests — Paperwork. No framework, no dependencies.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The Bureaucrat spec's "done means" is countable, so it is counted:
 *
 *   "A pasted notice that names three required documents yields a checklist naming all three,
 *    and every date the app reports appears verbatim in the source text. A scheme the user
 *    plainly does not qualify for returns 'likely not eligible' with the reason. Every screen
 *    carries the 'verify against the official source' line, and the draft exports as an
 *    editable file."
 *
 * Form Filler's must-nots are here too: no learned answer means a visibly blank field, never a
 * near-miss; two answers for one label are both offered; nothing is submitted anywhere.
 *
 *   node tests/self-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var P = require(path.join(ROOT, "docs", "play", "paperwork-core.js"));

var passed = 0;
var failed = [];
var group = "";

function section(n) { group = n; }
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(group + " :: " + name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }
function read(f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); }

/* An invented notice, in the shape of a real one. */
var NOTICE = [
  "Office of the Tehsildar, Haveli",
  "Notice dated 12/11/2026",
  "You are required to submit the following documents within 30 days, that is by 12 December 2026:",
  "a self-attested copy of the Aadhaar card, proof of residence, and an income certificate issued by the Tehsildar.",
  "A fee of Rs 250 is payable at the counter. Applications received after 12 December 2026 will not be considered.",
  "For the scheme, annual family income should be below Rs 2,00,000 and age between 18 and 60. Applicants must be resident of Maharashtra."
].join("\n");

/* ================================================ the spec's own "done means" */

section("done means — a notice naming three documents yields all three");
var ex = P.explain(NOTICE);
eq("the notice is read", ex.ok, true);
var names = ex.documents.map(function (d) { return d.name.toLowerCase(); }).join(" | ");
eq("three documents are found", ex.documents.length, 3, names);
ok("the Aadhaar card is named", names.indexOf("aadhaar") >= 0, names);
ok("the residence proof is named", names.indexOf("residence") >= 0, names);
ok("the income certificate is named", names.indexOf("income certificate") >= 0, names);
ok("every document carries the sentence it came from",
  ex.documents.every(function (d) { return d.quote && NOTICE.indexOf(d.quote) >= 0; }));

section("done means — every date reported appears verbatim in the source");
ok("at least two dates are found", ex.dates.length >= 2, ex.dates.map(function (d) { return d.text; }).join(","));
ok("every date is a verbatim substring of the pasted text",
  ex.dates.every(function (d) { return NOTICE.indexOf(d.text) >= 0; }),
  ex.dates.map(function (d) { return d.text; }).join(","));
ok("the numeric date is there", ex.dates.some(function (d) { return d.text === "12/11/2026"; }));
ok("the written date is there", ex.dates.some(function (d) { return d.text === "12 December 2026"; }));
ok("each date carries its context", ex.dates.every(function (d) { return d.context.length > 10; }));
ok("the fee is found", ex.fees.some(function (f) { return /250/.test(f.text); }), ex.fees.map(function (f) { return f.text; }).join(","));
ok("every amount is verbatim too", ex.fees.every(function (f) { return NOTICE.indexOf(f.text) >= 0; }));
ok("the deadline is found", ex.deadlines.some(function (d) { return /within 30 days/i.test(d.text); }),
  ex.deadlines.map(function (d) { return d.text; }).join(" | "));

section("done means — the conditions come out of the document, not out of the app");
var conds = P.conditions(NOTICE);
eq("three conditions are read", conds.length, 3, conds.map(function (c) { return c.id; }).join(","));
ok("the income condition is read", conds.some(function (c) { return c.kind === "income"; }));
ok("the age condition is read", conds.some(function (c) { return c.kind === "age"; }));
ok("the residency condition is read", conds.some(function (c) { return c.kind === "residency"; }));
ok("each condition quotes its sentence", conds.every(function (c) { return NOTICE.indexOf(c.quote) >= 0; }));

section("done means — plainly ineligible returns 'likely not eligible' with the reason");
var notElig = P.eligibility(conds, { income_max: 500000, age_range: 30, residency: "Maharashtra" });
eq("the verdict is likely not eligible", notElig.verdict, "likely not eligible");
ok("the reason names the income and the condition",
  /your income is 500000/.test(notElig.says) && /below Rs 2,00,000/.test(notElig.says), notElig.says);
ok("the failed condition is listed", notElig.failed.length === 1, JSON.stringify(notElig.failed));
var elig = P.eligibility(conds, { income_max: 150000, age_range: 30, residency: "Maharashtra" });
eq("a plainly eligible person gets likely eligible", elig.verdict, "likely eligible");
var partial = P.eligibility(conds, { income_max: 150000 });
eq("unanswered conditions are not treated as failures", partial.verdict, "not enough answered");
ok("and it names what is missing", /Annual income|Age between|Resident of/.test(partial.says), partial.says);
var noConds = P.eligibility([], {});
eq("no condition means no judgement", noConds.ok, false);
ok("and it says it will not guess", /cannot be judged/.test(noConds.reason), noConds.reason);

section("done means — every screen carries the verify line");
var page = read("docs/play/index.html");
var appSrc = read("docs/play/app.js");
eq("three panels each carry a verify element", (page.match(/class="verify"/g) || []).length, 3);
ok("the line says what it must", /Verify every detail against the official source/.test(P.VERIFY), P.VERIFY);
ok("the line says it is not legal advice", /not legal advice/.test(P.VERIFY));
ok("the page fills each panel's line from the engine", /P\.VERIFY/.test(appSrc));
ok("the export carries it too", /Verify every detail against the official source/.test(P.explainMarkdown(ex, {})));
ok("every draft carries it", P.TEMPLATES.every(function (t) {
  return /Verify every detail against the official source/.test(P.draft(t.id, {}).text);
}));

section("done means — the draft exports as an editable file");
var d = P.draft("covering", { authority: "The Tehsildar, Haveli", subject: "Income certificate", name: "S Momin", documents: ["Aadhaar card", "income certificate"] });
eq("a draft is produced", d.ok, true);
ok("it is text a person can edit", typeof d.text === "string" && d.text.indexOf("\n") > 0);
ok("it lists the documents from the notice", /Aadhaar card/.test(d.text) && /income certificate/.test(d.text));
ok("it says it is a draft, not a filing", /not a filing/.test(d.says), d.says);
ok("the draft export is a .txt", (function () {
  var wrote = null;
  P.exportFile("draft", { text: d.text }, { when: "25/11/2026" }, function (name) { wrote = name; return true; });
  return /\.txt$/.test(wrote);
})());

/* ============================================================ must-nots */

section("must-not — a field with no learned answer stays visibly blank");
var answers = [];
answers = P.learn(answers, "Full name as per Aadhaar", "Sohil Momin").answers;
answers = P.learn(answers, "Date of birth", "01/01/1990").answers;
var fill = P.fillForm(["Full name as per Aadhaar", "Annual family income", "Date of birth"], answers);
eq("two fields are filled", fill.filled, 2);
eq("the unknown field is blank", fill.blank.length, 1);
eq("and it is named", fill.blank[0], "Annual family income");
eq("its value is empty, not a near-miss", fill.rows[1].value, "");
eq("its state says blank", fill.rows[1].state, "blank");
ok("the app says a wrong answer is worse than a missing one", /worse than a missing one/.test(fill.says), fill.says);
ok("a near-miss label does not fill",
  P.fillForm(["Full name"], answers).rows[0].state === "blank",
  P.fillForm(["Full name"], answers).rows[0].state);

section("must-not — two answers for one label are both offered");
var dup = P.learn(answers, "Full name as per Aadhaar", "Dr S Momin");
eq("the second answer is accepted", dup.ok, true);
eq("it is flagged as a duplicate", dup.duplicate, true);
ok("both are kept", dup.answers.length, 3);
var fill2 = P.fillForm(["Full name as per Aadhaar"], dup.answers);
eq("the field asks rather than choosing", fill2.rows[0].state, "choose");
eq("both options are offered", fill2.rows[0].options.length, 2);
ok("no value is filled in for it", fill2.rows[0].value === "");

section("must-not — nothing is submitted, ever");
var core = read("docs/play/paperwork-core.js");
ok("no submit, no post, no fetch", !/\b(fetch|XMLHttpRequest|submitForm|postForm)\s*\(/.test(core));
ok("the fill says it stops", /Nothing was submitted/.test(P.fillForm(["A"], answers).says));
ok("the draft says the app never submits", /never submits anything/.test(d.says), d.says);
ok("the page says it too", /never submits/.test(page) || /Nothing is submitted/.test(page));

section("must-not — a form the app does not know is refused, not guessed");
var empty = P.fillForm([], answers);
eq("no labels is refused", empty.ok, false);
ok("and says what to give it", /paste the form's labels/.test(empty.reason), empty.reason);
eq("an empty document is refused", P.explain("   ").ok, false);
eq("an empty field label is refused", P.learn(answers, "", "x").ok, false);
eq("an empty value is refused", P.learn(answers, "A", "  ").ok, false);

section("must-not — an unreadable set is reported, never written over");
var bad = P.parseState("{ broken answers");
eq("a corrupt set is reported", bad.ok, false);
ok("it was not written over", /not written over/.test(bad.reason), bad.reason);
eq("the raw text is kept for export", bad.raw, "{ broken answers");
var part = P.parseState(JSON.stringify({ answers: [{ label: "A", value: "x" }, { label: "B", value: "" }] }));
eq("a partial set loads", part.ok, true);
eq("with the missing label named", part.missing[0], "B");
eq("the good answer is kept", part.state.answers.length, 1);

section("must-not — it must not grow a second job");
ok("must_not_grow_a_second_job: one store, no tags, no sync",
  !/\b(tags|labels|folders)\s*[:=]/i.test(core) && !/\bsync\s*[:(]/i.test(core));
ok("must_not_grow_a_second_job: no model, key or endpoint",
  !/\b(apiKey|endpoint|openai|gpt)\s*[:=]/i.test(core) && !/https?:\/\//.test(core));
ok("must_not_claim_ocr: the page says the text is pasted", /no OCR here/.test(page));

/* ================================================== the other mechanics */

section("mechanic — tracking keeps status and next action");
var tracked = P.addApplication([], { title: "Income certificate application", next: "collect after 12/12/2026", at: 1 });
eq("an application is tracked", tracked.ok, true);
eq("with its next action", tracked.row.next, "collect after 12/12/2026");
eq("a titleless application is refused", P.addApplication([], { next: "x" }).field, "title");

section("mechanic — the three templates are the three things people actually write");
eq("there are three templates", P.TEMPLATES.length, 3);
ok("a covering letter", !!P.templateById("covering"));
ok("an RTI request", !!P.templateById("rti"));
ok("a reply to a notice", !!P.templateById("reply"));
ok("the RTI draft cites the Act and the section", /Right to Information Act, 2005/.test(P.draft("rti", {}).text) && /section 6\(1\)/.test(P.draft("rti", {}).text));
ok("the RTI draft tells you the fee and format differ by authority", /differ between authorities/.test(P.draft("rti", {}).text));
eq("an unknown template is refused", P.draft("nope", {}).field, "template");

section("failure case — storage full or unavailable");
var thrown = P.exportFile("draft", { text: "x" }, { when: "25/11/2026" }, function () {
  var e = new Error("quota"); e.name = "QuotaExceededError"; throw e;
});
eq("a failed write is reported as failed", thrown.ok, false);
ok("a failed write says the file was not written", /not written/.test(thrown.reason), thrown.reason);
ok("a failed write names the cause", /storage is full/.test(thrown.reason));
eq("no writer means no file", P.exportFile("draft", { text: "x" }, {}, null).ok, false);
ok("the page says a half-filled form is not safe when the save fails",
  /do not assume a half-filled form is safe/.test(appSrc));

section("failure case — no network");
["docs/play/paperwork-core.js", "docs/play/app.js", "docs/play/sw.js", "docs/play/web-kit.js", "docs/play/export-kit.js"].forEach(function (f) {
  var src = read(f);
  ok("no fetch call in " + f, !/\bfetch\s*\(/.test(src));
  ok("no XHR/WebSocket/beacon in " + f, !/XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(src));
});
ok("the page forbids connections in its CSP", /connect-src 'none'/.test(page));
/* the page may link to this project (source, releases, sponsor) and to nothing else: a link to a government
 * portal would be the app sending someone to a site it cannot see or vouch for */
ok("the page does not link out to a portal",
  !/https?:\/\/(?!(github\.com\/(drsamonline|sponsors\/drsamonline)|drsamonline\.github\.io\/app-paperwork))/.test(page));

section("shape — every script the page loads exists beside it");
var srcs = (page.match(/<script[^>]+src="([^"]+)"/g) || []).map(function (t) { return t.replace(/.*src="([^"]+)"/, "$1"); });
srcs.forEach(function (s) {
  ok("script src resolves: " + s, fs.existsSync(path.join(ROOT, "docs", "play", s.replace(/^\.\//, ""))));
});
ok("the landing page exists", fs.existsSync(path.join(ROOT, "docs", "index.html")));
ok("the page manifest exists", fs.existsSync(path.join(ROOT, "PAGES.json")));

/* ============================================================== summary */

var total = passed + failed.length;
if (!total) { console.error("self-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
if (failed.length) {
  console.error("self-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.slice(0, 12).forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("self-tests: " + passed + "/" + total + " assertions passed");

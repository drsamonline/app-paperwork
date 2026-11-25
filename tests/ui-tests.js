#!/usr/bin/env node
/* ui-tests — the Paperwork page in a real DOM (jsdom).
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The engine has its own suite, including the countable done-means. This one proves the page is
 * wired to it: a pasted notice yields the three documents and the dates on screen, the conditions
 * become questions and an ineligible answer comes back "likely not eligible", every panel carries
 * the verify line, the draft is editable and exports, an unlearned field stays visibly blank, two
 * answers are both offered, and a corrupt set is reported rather than written over.
 *
 *   npm install --no-save jsdom && node tests/ui-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var { JSDOM } = require("jsdom");

var ROOT = path.join(__dirname, "..");
var PLAY = path.join(ROOT, "docs", "play");
var PAGE = path.join(PLAY, "index.html");

var passed = 0;
var failed = [];
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }

var NOTICE = [
  "Office of the Tehsildar, Haveli",
  "Notice dated 12/11/2026",
  "You are required to submit the following documents within 30 days, that is by 12 December 2026:",
  "a self-attested copy of the Aadhaar card, proof of residence, and an income certificate issued by the Tehsildar.",
  "A fee of Rs 250 is payable at the counter.",
  "For the scheme, annual family income should be below Rs 2,00,000 and age between 18 and 60. Applicants must be resident of Maharashtra."
].join("\n");

function build(seed) {
  var html = fs.readFileSync(PAGE, "utf8");
  var dom = new JSDOM(html, { url: "https://example.test/play/index.html", runScripts: "outside-only", pretendToBeVisual: true });
  var w = dom.window;
  if (seed) Object.keys(seed).forEach(function (k) { w.localStorage.setItem(k, seed[k]); });
  w.URL.createObjectURL = function () { return "blob:x"; };
  w.URL.revokeObjectURL = function () {};
  w.HTMLAnchorElement.prototype.click = function () {};
  ["web-kit.js", "export-kit.js", "paperwork-core.js", "app.js"].forEach(function (f) {
    w.eval(fs.readFileSync(path.join(PLAY, f), "utf8"));
  });
  return dom;
}

var dom = build(null);
var w = dom.window;
var d = w.document;
var $ = function (id) { return d.getElementById(id); };

ok("the engine loaded into the page", !!w.PaperworkCore);

/* -------------------------------------------------- the verify line, always */

ok("the explain panel carries the verify line", /official source/.test($("verify-explain").textContent), $("verify-explain").textContent);
ok("the draft panel carries it", /official source/.test($("verify-draft").textContent));
ok("the forms panel carries it", /official source/.test($("verify-forms").textContent));
ok("it says it is not legal advice", /not legal advice/.test($("verify-explain").textContent));

/* ------------------------------------------------------------- explaining */

$("notice").value = "";
$("readBtn").click();
ok("an empty paste is refused", /nothing pasted/.test($("status").textContent), $("status").textContent);

$("notice").value = NOTICE;
$("readBtn").click();
eq("the explanation appears", $("explainCard").hidden, false);
ok("three documents are listed", d.querySelectorAll("#docList li").length === 3, d.querySelectorAll("#docList li").length);
var docsText = $("docList").textContent;
ok("the Aadhaar card is named on screen", /Aadhaar/.test(docsText), docsText);
ok("the residence proof is named", /residence/.test(docsText));
ok("the income certificate is named", /income certificate/.test(docsText));
ok("a date is shown verbatim", /12\/11\/2026/.test($("dateList").textContent), $("dateList").textContent);
ok("the written date is shown too", /12 December 2026/.test($("dateList").textContent));
ok("the fee is shown", /250/.test($("dateList").textContent));
ok("the deadline is shown", /within 30 days/i.test($("dateList").textContent));

/* ------------------------------------------------------------ eligibility */

eq("three condition questions appear", d.querySelectorAll("#condQuestions input").length, 3);
ok("the income condition is asked", /Annual income at or below/.test($("condQuestions").textContent), $("condQuestions").textContent);

$("cond-income_max").value = "500000";
$("cond-age_range").value = "30";
$("cond-residency").value = "Maharashtra";
$("checkElig").click();
eq("the verdict appears", $("verdictCard").hidden, false);
ok("the verdict is likely not eligible", /likely NOT eligible/i.test($("verdictSays").textContent), $("verdictSays").textContent);
ok("the reason names the income", /your income is 500000/.test($("verdictSays").textContent), $("verdictSays").textContent);
ok("the failed condition is listed", /not met/.test($("verdictList").textContent), $("verdictList").textContent);

$("cond-income_max").value = "150000";
$("checkElig").click();
ok("an eligible person gets likely eligible", /Likely eligible/.test($("verdictSays").textContent), $("verdictSays").textContent);

/* ----------------------------------------------------------------- drafting */

$("tab-draft").click();
eq("the draft panel shows", $("panel-draft").hidden, false);
eq("three templates are offered", $("template").options.length, 3);

$("template").value = "covering";
$("authority").value = "The Tehsildar, Haveli";
$("subject").value = "Application for an income certificate";
$("name").value = "S Momin";
$("makeDraft").click();
eq("the draft appears", $("draftCard").hidden, false);
ok("the draft is editable text", $("draftText").value.length > 80, $("draftText").value.length);
ok("it carries the documents from the notice", /Aadhaar card/.test($("draftText").value), $("draftText").value.slice(0, 200));
ok("it carries the verify line", /official source/.test($("draftText").value));
ok("the app says it is a draft, not a filing", /not a filing/.test($("draftSays").textContent), $("draftSays").textContent);

$("draftText").value = $("draftText").value + "\n\n(edited by me)";
$("exportDraft").click();
ok("the edited draft exports", /Wrote paperwork-draft-\d{4}-\d\d-\d\d\.txt/.test($("draftNote").textContent), $("draftNote").textContent);

/* ------------------------------------------------------------------- forms */

$("tab-forms").click();
eq("the forms panel shows", $("panel-forms").hidden, false);

$("learnLabel").value = "Full name as per Aadhaar";
$("learnValue").value = "Sohil Momin";
$("learnBtn").click();
eq("an answer is learned", d.querySelectorAll("#answersList li").length, 1);

$("learnLabel").value = "Full name as per Aadhaar";
$("learnValue").value = "Dr S Momin";
$("learnBtn").click();
ok("a second answer for the same label is announced", /Kept both answers/.test($("status").textContent), $("status").textContent);

$("labels").value = "Full name as per Aadhaar\nAnnual family income";
$("fillBtn").click();
eq("the filled table appears", $("fillTable").hidden, false);
var rows = d.querySelectorAll("#fillTable tbody tr");
eq("two rows", rows.length, 2);
ok("the known field asks which answer", /choose one/.test(rows[0].textContent), rows[0].textContent);
ok("the unknown field stays visibly blank", /blank/.test(rows[1].textContent), rows[1].textContent);
ok("nothing was submitted", /Nothing was submitted/.test($("fillNote").textContent), $("fillNote").textContent);

$("exportFill").click();
ok("the filled form exports", /Wrote paperwork-filled-/.test($("fillNote").textContent), $("fillNote").textContent);

/* ----------------------------------------------------------------- tracking */

$("appTitle").value = "Income certificate application";
$("appNext").value = "collect after 12/12/2026";
$("trackBtn").click();
eq("the application is tracked", d.querySelectorAll("#appList li").length, 1);
ok("the next action is shown", /collect after/.test($("appList").textContent), $("appList").textContent);

/* ------------------------------------------------------------------ reload */

var saved = w.localStorage.getItem("paperwork:state");
ok("the state was written to the device", !!saved);
var dom2 = build({ "paperwork:state": saved });
var d2 = dom2.window.document;
eq("the reload keeps the learned answers", d2.querySelectorAll("#answersList li").length, 2);
eq("the reload keeps the tracked application", d2.querySelectorAll("#appList li").length, 1);

/* ------------------------------------------- a corrupt set on reload */

var dom3 = build({ "paperwork:state": "{ broken answers" });
var d3 = dom3.window.document;
ok("a corrupt set is reported", /not readable JSON/.test(d3.getElementById("status").textContent),
  d3.getElementById("status").textContent);
ok("it says it was not written over", /not written over/.test(d3.getElementById("status").textContent));
ok("it offers an export of the unreadable answers",
  Array.prototype.some.call(d3.querySelectorAll("button"), function (b) { return /Export the unreadable answers/.test(b.textContent); }));
ok("the corrupt file is not overwritten", /broken answers/.test(dom3.window.localStorage.getItem("paperwork:state")),
  dom3.window.localStorage.getItem("paperwork:state"));

/* --------------------------------- a partial set loads with gaps named */

var dom4 = build({ "paperwork:state": JSON.stringify({ answers: [{ label: "A", value: "x" }, { label: "B", value: "" }] }) });
var d4 = dom4.window.document;
ok("a partial set says what is missing", /Loaded with gaps/.test(d4.getElementById("status").textContent),
  d4.getElementById("status").textContent);
ok("and names the missing label", /B/.test(d4.getElementById("status").textContent));
eq("the good answer is loaded", d4.querySelectorAll("#answersList li").length, 1);

var total = passed + failed.length;
if (!total) { console.error("ui-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
if (failed.length) {
  console.error("ui-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("ui-tests: " + passed + "/" + total + " assertions passed");
dom.window.close(); dom2.window.close(); dom3.window.close(); dom4.window.close();

/* app — the Paperwork page. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * Wiring only: the extraction, the conditions, the eligibility rules, the templates, the
 * learned answers and the filling all live in paperwork-core.js, which the tests exercise
 * directly.
 */
(function () {
  "use strict";

  var P = window.PaperworkCore;
  var $ = function (id) { return document.getElementById(id); };

  var K_STATE = "paperwork:state";

  var els = {
    status: $("status"),
    notice: $("notice"), readBtn: $("readBtn"), example: $("example"), exportExplain: $("exportExplain"), readNote: $("readNote"),
    explainCard: $("explainCard"), explainSays: $("explainSays"), docList: $("docList"), dateList: $("dateList"),
    eligCard: $("eligCard"), condQuestions: $("condQuestions"), checkElig: $("checkElig"), eligNote: $("eligNote"),
    verdictCard: $("verdictCard"), verdictSays: $("verdictSays"), verdictList: $("verdictList"),
    template: $("template"), authority: $("authority"), subject: $("subject"), name: $("name"),
    reference: $("reference"), contact: $("contact"), makeDraft: $("makeDraft"), exportDraft: $("exportDraft"),
    draftNote: $("draftNote"), draftCard: $("draftCard"), draftText: $("draftText"), draftSays: $("draftSays"),
    learnLabel: $("learnLabel"), learnValue: $("learnValue"), learnBtn: $("learnBtn"), learnNote: $("learnNote"),
    answersList: $("answersList"), labels: $("labels"), fillBtn: $("fillBtn"), exportFill: $("exportFill"),
    fillNote: $("fillNote"), fillTable: $("fillTable"),
    appTitle: $("appTitle"), appNext: $("appNext"), trackBtn: $("trackBtn"), trackNote: $("trackNote"), appList: $("appList")
  };

  var state = { explain: null, conditions: [], answers: [], applications: [], drafts: [], fill: null, draft: null };

  /* ------------------------------------------------------------- helpers */

  function today() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function setStatus(kind, msg) {
    els.status.className = "status show " + kind;
    els.status.textContent = msg;
  }
  function clearStatus() { els.status.className = "status"; els.status.textContent = ""; }

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function persist() {
    try {
      window.localStorage.setItem(K_STATE, P.serializeState({ savedOn: Date.now(), answers: state.answers, applications: state.applications, drafts: state.drafts }));
      return true;
    } catch (e) {
      setStatus("bad", "NOT saved: " + (e && e.name === "QuotaExceededError" ? "storage is full" : "storage is unavailable") +
        ". What you just did is on screen only — export it before you close this page, and do not assume a half-filled form is safe.");
      return false;
    }
  }

  /* ------------------------------------------------------------ explain */

  function readIt() {
    clearStatus();
    var out = P.explain(els.notice.value);
    if (!out.ok) { setStatus("bad", out.reason); return; }
    state.explain = out;
    els.explainCard.hidden = false;
    els.explainSays.textContent = out.says;

    els.docList.textContent = "";
    if (!out.documents.length) els.docList.appendChild(node("li", null, "None found in the text."));
    out.documents.forEach(function (d) {
      var li = node("li");
      li.appendChild(node("span", "tag", d.kind));
      li.appendChild(document.createTextNode(d.name));
      li.appendChild(node("span", "q", "\u201c" + d.quote + "\u201d"));
      els.docList.appendChild(li);
    });

    els.dateList.textContent = "";
    out.dates.forEach(function (d) {
      var li = node("li");
      li.appendChild(node("span", "tag", "date"));
      li.appendChild(document.createTextNode(d.text));
      li.appendChild(node("span", "q", "\u201c" + d.context + "\u201d"));
      els.dateList.appendChild(li);
    });
    out.fees.forEach(function (f) {
      var li = node("li");
      li.appendChild(node("span", "tag warn", "amount"));
      li.appendChild(document.createTextNode(f.text));
      li.appendChild(node("span", "q", "\u201c" + f.context + "\u201d"));
      els.dateList.appendChild(li);
    });
    out.deadlines.forEach(function (d) {
      var li = node("li");
      li.appendChild(node("span", "tag warn", "deadline"));
      li.appendChild(document.createTextNode(d.text));
      li.appendChild(node("span", "q", "\u201c" + d.context + "\u201d"));
      els.dateList.appendChild(li);
    });
    if (!out.dates.length && !out.fees.length && !out.deadlines.length) {
      els.dateList.appendChild(node("li", null, "No dates, amounts or deadlines found in the text."));
    }

    /* The conditions are read from the same text; if there are none, say so rather than
     * pretending to judge eligibility. */
    state.conditions = P.conditions(els.notice.value);
    renderConditions();
    setStatus("ok", out.says);
  }

  function renderConditions() {
    els.condQuestions.textContent = "";
    if (!state.conditions.length) {
      els.eligCard.hidden = false;
      els.condQuestions.appendChild(node("p", "claim",
        "No eligibility condition could be read out of this document, so the app cannot judge eligibility from it \u2014 and it will not guess."));
      els.checkElig.hidden = true;
      return;
    }
    els.eligCard.hidden = false;
    els.checkElig.hidden = false;
    state.conditions.forEach(function (c) {
      var wrap = node("div");
      var lab = node("label", "fld", c.label);
      lab.setAttribute("for", "cond-" + c.id);
      wrap.appendChild(lab);
      var inp = document.createElement("input");
      inp.type = "text";
      inp.id = "cond-" + c.id;
      inp.placeholder = c.question;
      wrap.appendChild(inp);
      wrap.appendChild(node("span", "q", "\u201c" + c.quote + "\u201d"));
      els.condQuestions.appendChild(wrap);
    });
  }

  function checkEligibility() {
    var answers = {};
    state.conditions.forEach(function (c) {
      var el = $("cond-" + c.id);
      if (el && el.value.trim()) answers[c.id] = el.value.trim();
    });
    var out = P.eligibility(state.conditions, answers);
    if (!out.ok) { setStatus("bad", out.reason); return; }
    els.verdictCard.hidden = false;
    els.verdictSays.textContent = out.says;
    els.verdictList.textContent = "";
    out.met.forEach(function (m) {
      var li = node("li");
      li.appendChild(node("span", "tag ok", "met"));
      li.appendChild(document.createTextNode(m.label + " \u2014 " + m.why));
      els.verdictList.appendChild(li);
    });
    out.failed.forEach(function (f) {
      var li = node("li");
      li.appendChild(node("span", "tag bad", f.why === "not answered" ? "unanswered" : "not met"));
      li.appendChild(document.createTextNode(f.label + " \u2014 " + f.why));
      els.verdictList.appendChild(li);
    });
    setStatus(out.verdict === "likely eligible" ? "ok" : out.verdict === "likely not eligible" ? "bad" : "warn", out.says);
  }

  /* -------------------------------------------------------------- draft */

  function makeDraft() {
    clearStatus();
    var out = P.draft(els.template.value, {
      authority: els.authority.value,
      subject: els.subject.value,
      name: els.name.value,
      reference: els.reference.value,
      contact: els.contact.value,
      documents: state.explain ? state.explain.documents.map(function (d) { return d.name; }) : []
    });
    if (!out.ok) { setStatus("bad", out.reason); return; }
    state.draft = out;
    els.draftCard.hidden = false;
    els.exportDraft.hidden = false;
    els.draftText.value = out.text;
    els.draftSays.textContent = out.says;
    setStatus("ok", "Draft written. Edit it before you send it \u2014 it is yours, not the app's.");
  }

  /* --------------------------------------------------------------- forms */

  function learnAnswer() {
    clearStatus();
    var out = P.learn(state.answers, els.learnLabel.value, els.learnValue.value, { at: Date.now() });
    if (!out.ok) { setStatus("bad", out.reason); return; }
    state.answers = out.answers;
    els.learnLabel.value = "";
    els.learnValue.value = "";
    renderAnswers();
    var saved = persist();
    els.learnNote.textContent = out.says;
    /* the class was right and the WORDS were wrong: a failed save still said "Learned ...". The warning
     * persist() already printed is the message; a cheerful line only when the write worked. */
    if (saved) setStatus(out.duplicate ? "warn" : "ok", out.says);
  }

  function renderAnswers() {
    els.answersList.textContent = "";
    state.answers.forEach(function (a) {
      var li = node("li");
      li.appendChild(node("span", "tag", "learned"));
      li.appendChild(document.createTextNode(a.label + ": " + a.value));
      els.answersList.appendChild(li);
    });
  }

  function fillIt() {
    clearStatus();
    var labels = els.labels.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var out = P.fillForm(labels, state.answers);
    if (!out.ok) { setStatus("bad", out.reason); return; }
    state.fill = out;
    els.fillTable.hidden = false;
    els.exportFill.hidden = false;
    var body = els.fillTable.querySelector("tbody");
    body.textContent = "";
    out.rows.forEach(function (r) {
      var tr = node("tr");
      tr.appendChild(node("td", null, r.label));
      var td = node("td");
      if (r.state === "filled") td.textContent = r.value;
      else if (r.state === "choose") { td.textContent = "choose one: " + r.options.join(" / "); td.className = "blank"; }
      else { td.textContent = "blank — no learned answer"; td.className = "blank"; }
      tr.appendChild(td);
      body.appendChild(tr);
    });
    els.fillNote.textContent = out.says;
    setStatus(out.blank.length || out.choose.length ? "warn" : "ok", out.says);
  }

  function trackIt() {
    var out = P.addApplication(state.applications, { title: els.appTitle.value, next: els.appNext.value, at: Date.now() });
    if (!out.ok) { setStatus("bad", out.reason); return; }
    state.applications = out.applications;
    els.appTitle.value = "";
    els.appNext.value = "";
    renderApps();
    var saved = persist();
    els.trackNote.textContent = out.says;
    if (saved) setStatus("ok", out.says);
  }

  function renderApps() {
    els.appList.textContent = "";
    state.applications.forEach(function (a) {
      var li = node("li");
      li.appendChild(node("span", "tag", a.status));
      li.appendChild(document.createTextNode(a.title));
      if (a.next) li.appendChild(node("span", "q", "next: " + a.next));
      els.appList.appendChild(li);
    });
  }

  /* ------------------------------------------------------------- export */

  function writer(name, text, mime) {
    if (!window.Export || typeof window.Export.save !== "function") throw new Error("the export kit did not load");
    window.Export.save(name, text, mime);
    return true;
  }

  function doExport(what, payload, noteEl) {
    var out = P.exportFile(what, payload, { when: today() }, writer);
    if (out.ok) {
      noteEl.textContent = "Wrote " + out.filename + " (" + out.bytes + " bytes).";
      setStatus("ok", "Wrote " + out.filename + " \u2014 editable, and yours to check.");
    } else {
      setStatus("bad", out.reason + ".");
    }
  }

  /* ---------------------------------------------------------------- tabs */

  ["explain", "draft", "forms"].forEach(function (name) {
    $("tab-" + name).addEventListener("click", function () {
      ["explain", "draft", "forms"].forEach(function (other) {
        var on = other === name;
        $("tab-" + other).setAttribute("aria-selected", on ? "true" : "false");
        $("panel-" + other).hidden = !on;
      });
    });
  });

  /* ---------------------------------------------------------------- wire */

  P.TEMPLATES.forEach(function (t) {
    var o = node("option", null, t.label);
    o.value = t.id;
    els.template.appendChild(o);
  });

  els.readBtn.addEventListener("click", readIt);
  els.checkElig.addEventListener("click", checkEligibility);
  els.makeDraft.addEventListener("click", makeDraft);
  els.learnBtn.addEventListener("click", learnAnswer);
  els.fillBtn.addEventListener("click", fillIt);
  els.trackBtn.addEventListener("click", trackIt);
  els.exportExplain.addEventListener("click", function () {
    if (!state.explain) { setStatus("bad", "Read a document first."); return; }
    doExport("explain", { explain: state.explain }, els.readNote);
  });
  els.exportDraft.addEventListener("click", function () {
    if (!els.draftText.value.trim()) { setStatus("bad", "There is no draft to export."); return; }
    doExport("draft", { text: els.draftText.value }, els.draftNote);
  });
  els.exportFill.addEventListener("click", function () {
    if (!state.fill) { setStatus("bad", "Fill a form first."); return; }
    doExport("filled", { fill: state.fill }, els.fillNote);
  });

  var EXAMPLE = [
    "Office of the Tehsildar, Haveli",
    "Notice dated 12/11/2026",
    "You are required to submit the following documents within 30 days, that is by 12 December 2026:",
    "a self-attested copy of the Aadhaar card, proof of residence, and an income certificate issued by the Tehsildar.",
    "A fee of Rs 250 is payable at the counter. Applications received after 12 December 2026 will not be considered.",
    "For the scheme, annual family income should be below Rs 2,00,000 and age between 18 and 60. Applicants must be resident of Maharashtra."
  ].join("\n");

  els.example.addEventListener("click", function () {
    els.notice.value = EXAMPLE;
    setStatus("ok", "Example notice loaded — invented, in the shape of a real one. Press Read it.");
  });

  /* ------------------------------------------------------------ start up */

  /* Every screen carries the warning. It is set from the engine's own string, so the page
   * cannot drift from what the exports say. */
  ["explain", "draft", "forms"].forEach(function (name) {
    var el = $("verify-" + name);
    if (el) el.textContent = P.VERIFY;
  });

  var raw = null;
  try { raw = window.localStorage.getItem(K_STATE); } catch (e) { raw = null; }
  if (raw) {
    var parsed = P.parseState(raw);
    if (parsed.ok) {
      state.answers = parsed.state.answers;
      state.applications = parsed.state.applications;
      state.drafts = parsed.state.drafts;
      if (parsed.missing && parsed.missing.length) {
        setStatus("warn", "Loaded with gaps: " + parsed.missing.length + " saved answer(s) had no value and are not shown \u2014 " + parsed.missing.join(", ") + ". Learn them again if you need them.");
      }
    } else {
      setStatus("bad", parsed.reason);
      var keep = node("button", "small", "Export the unreadable answers");
      keep.addEventListener("click", function () { doExport("raw", parsed, els.learnNote); });
      els.learnNote.parentNode.insertBefore(keep, els.learnNote);
      var fresh = node("button", "small", "Start again, deliberately");
      fresh.addEventListener("click", function () {
        try { window.localStorage.removeItem(K_STATE); } catch (e) { /* nothing to remove */ }
        state.answers = [];
        state.applications = [];
        renderAnswers();
        renderApps();
        setStatus("ok", "Starting again, deliberately. The unreadable file is gone.");
      });
      els.learnNote.parentNode.insertBefore(fresh, els.learnNote);
    }
  }

  renderAnswers();
  renderApps();
  if (window.Loom && window.Loom.pwa) window.Loom.pwa.register("sw.js");
})();

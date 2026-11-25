/* paperwork-core — the engine behind Paperwork.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * ONE JOB: turn a piece of paper you have to deal with into something you can act on.
 * Both specs are that job — one explains the paper, the other fills it:
 *
 *   explain   paste a notice, circular or letter. The app extracts the documents it
 *             asks for, the dates, the fees and the deadlines, and QUOTES the sentence
 *             each came from. It does not interpret: there is no model here, and every
 *             line it shows can be found in your text.
 *   eligibility   the conditions are read OUT OF THE DOCUMENT ("annual income below
 *             Rs 2,00,000", "age between 18 and 60"), then you answer them and the app
 *             says likely eligible or likely not — with the condition that decided it.
 *   fill      a form's fields, learned once as label -> answer, reused on any form that
 *             asks the same thing. A label with no learned answer stays visibly blank.
 *
 * It is guidance and a draft, never legal advice, and every screen says so.
 *
 * Pure functions: no DOM, no network, no storage. The page does the wiring.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PaperworkCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = "1.0.0";
  var VERIFY = "Verify every detail against the official source before you submit. This is guidance and a draft, not legal advice.";

  /* ------------------------------------------------------------- sentences */

  function sentences(text) {
    var raw = String(text || "").replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim();
    if (!raw) return [];
    var out = [];
    var buf = "";
    for (var i = 0; i < raw.length; i++) {
      var ch = raw.charAt(i);
      buf += ch;
      if (ch === "." || ch === "!" || ch === "?") {
        var prev = raw.charAt(i - 1);
        var next = raw.slice(i + 1).replace(/^\s+/, "").charAt(0);
        if (/[0-9]/.test(prev) && /[0-9]/.test(next)) continue;
        if (!next || /[A-Z0-9"'\u2018\u201c]/.test(next)) { out.push(buf.trim()); buf = ""; }
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  function lines(text) {
    return String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  }

  /* ------------------------------------------------------------ documents
   * The document names are taken from the words around the marker — never invented.
   * "a self-attested copy of the Aadhaar card" yields "Aadhaar card".
   */
  var DOC_MARKERS = [
    { re: /self[- ]attested\s+(?:copy\s+)?of\s+(?:the\s+)?([^,.;]+)/i, kind: "self-attested copy" },
    { re: /(?:a\s+)?copy\s+of\s+(?:the\s+)?([^,.;]+)/i, kind: "copy" },
    { re: /proof\s+of\s+([^,.;]+)/i, kind: "proof" },
    { re: /([A-Za-z][A-Za-z ]{2,30}?\s+certificate)/i, kind: "certificate" },
    { re: /(?:attach|produce|furnish)\s+(?:a\s+|the\s+)?([^,.;]{3,60})/i, kind: "to attach" }
  ];

  /* Names are taken from the words around the marker and nothing else. Anything that
   * reads like a heading rather than a document is dropped rather than shown as one. */
  var JUNK = /^(following|document|documents|list|above|below|copies|copies of|same|these|those)$/i;

  function cleanDocName(s) {
    var out = String(s || "")
      .replace(/\s+/g, " ")
      .replace(/^(?:and|or|also|along\s+with)\s+/i, "")
      .replace(/^(?:the|a|an)\s+/i, "")
      .replace(/^(?:and|or|also|along\s+with)\s+/i, "")
      .replace(/^(?:the|a|an)\s+/i, "")
      .replace(/\s+(?:and|or|also)\s*$/i, "")
      .replace(/[\s,;:]+$/, "")
      .trim();
    if (JUNK.test(out)) return "";
    if (/\b(days?|weeks?|months?|date|dated|within|below|above)\b/i.test(out)) return "";
    if (out.length > 60) out = out.slice(0, 60).trim();
    return out;
  }

  function documents(text) {
    var src = String(text || "");
    var found = {};
    sentences(src).forEach(function (s) {
      DOC_MARKERS.forEach(function (m) {
        var hit = m.re.exec(s);
        if (!hit) return;
        var name = cleanDocName(hit[1]);
        if (!name || name.length < 3) return;
        var key = name.toLowerCase();
        if (found[key]) return;
        /* The quote is a verbatim slice of what was pasted, so a person can find it again.
         * A whitespace-normalised sentence would not always be findable. */
        var at = src.toLowerCase().indexOf(name.toLowerCase());
        found[key] = { name: name, kind: m.kind, quote: at >= 0 ? contextAround(src, at, name.length) : s };
      });
    });
    return Object.keys(found).map(function (k) { return found[k]; });
  }

  /* ---------------------------------------------------------------- dates
   * Every date reported is the string that was in the text, character for character,
   * so a person can find it again.
   */
  var MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
  var DATE_PATTERNS = [
    { re: /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g, kind: "numeric date" },
    { re: new RegExp("\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:" + MONTHS + ")\\s+\\d{4}\\b", "gi"), kind: "written date" },
    { re: new RegExp("\\b(?:" + MONTHS + ")\\s+\\d{1,2},?\\s+\\d{4}\\b", "gi"), kind: "written date" }
  ];

  function dates(text) {
    var src = String(text || "");
    var out = [];
    var seen = {};
    DATE_PATTERNS.forEach(function (p) {
      var m;
      var re = new RegExp(p.re.source, p.re.flags);
      while ((m = re.exec(src))) {
        var v = m[0];
        if (seen[v]) continue;
        seen[v] = true;
        var at = m.index;
        out.push({ text: v, kind: p.kind, context: contextAround(src, at, v.length) });
      }
    });
    return out.sort(function (a, b) { return src.indexOf(a.text) - src.indexOf(b.text); });
  }

  /* A verbatim slice: whitespace is NOT collapsed, so the quote can be found again in
   * the text the person pasted. */
  function contextAround(src, at, len) {
    var from = Math.max(0, at - 90);
    var to = Math.min(src.length, at + len + 90);
    return src.slice(from, to).trim();
  }

  /* --------------------------------------------------------------- money */
  var MONEY = /(?:rs\.?|inr|\u20b9)\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s?(?:rupees|lakh|crore)/gi;

  function fees(text) {
    var src = String(text || "");
    var out = [];
    var seen = {};
    var m;
    var re = new RegExp(MONEY.source, "gi");
    while ((m = re.exec(src))) {
      var v = m[0].trim();
      if (seen[v.toLowerCase()]) continue;
      seen[v.toLowerCase()] = true;
      out.push({ text: v, context: contextAround(src, m.index, v.length) });
    }
    return out;
  }

  /* ------------------------------------------------------------ deadlines */
  var DEADLINE = /\bwithin\s+(\d{1,3})\s+(day|days|week|weeks|month|months)\b|\bby\s+([^,.;]{3,40})/gi;

  function deadlines(text) {
    var src = String(text || "");
    var out = [];
    var m;
    var re = new RegExp(DEADLINE.source, "gi");
    while ((m = re.exec(src))) {
      var v = m[0].trim();
      out.push({ text: v, context: contextAround(src, m.index, v.length) });
    }
    return out;
  }

  /* --------------------------------------------------------- the explain */

  function explain(text) {
    var src = String(text || "");
    if (!src.trim()) {
      return { ok: false, reason: "there is nothing pasted: give the app the text of the notice, form or letter" };
    }
    if (sentences(src).length < 1) {
      return { ok: false, reason: "no sentence could be read in that text, so nothing was explained" };
    }
    var docs = documents(src);
    var dts = dates(src);
    var mny = fees(src);
    var dls = deadlines(src);
    return {
      ok: true,
      documents: docs,
      dates: dts,
      fees: mny,
      deadlines: dls,
      verify: VERIFY,
      says: "Read from your text: " + docs.length + " document(s), " + dts.length + " date(s), " +
        mny.length + " amount(s) and " + dls.length + " deadline(s). Every line below can be found in what you pasted \u2014 " +
        "nothing here was interpreted by a model.",
      empty: { documents: docs.length === 0, dates: dts.length === 0, fees: mny.length === 0, deadlines: dls.length === 0 }
    };
  }

  /* ---------------------------------------------------------- eligibility
   * The conditions come OUT OF THE DOCUMENT. This app does not know any scheme's rules and
   * does not pretend to: it reads the conditions it can see and asks you about those.
   */
  function conditions(text) {
    var src = String(text || "");
    var out = [];
    function verbatim(sentence) {
      var at = src.indexOf(sentence);
      return at >= 0 ? contextAround(src, at, sentence.length) : sentence;
    }
    sentences(src).forEach(function (s) {
      var low = s.toLowerCase();
      var m;

      m = /annual\s+(?:family\s+)?income\s+(?:is\s+|should\s+be\s+)?(?:below|less than|under|upto|up to)\s*((?:rs\.?|inr|\u20b9)?\s?[\d,]+)/i.exec(s);
      if (m) out.push({ id: "income_max", kind: "income", label: "Annual income at or below " + m[1].trim(), limit: numberFrom(m[1]), question: "What is your annual family income, in rupees?", quote: verbatim(s) });
      else {
        var m2 = /income\s+(?:is\s+)?(?:above|more than)\s*((?:rs\.?|inr|\u20b9)?\s?[\d,]+)/i.exec(s);
        if (m2) out.push({ id: "income_min", kind: "income", label: "Annual income above " + m2[1].trim(), limit: numberFrom(m2[1]), question: "What is your annual family income, in rupees?", quote: verbatim(s) });
      }

      m = /age\s+(?:is\s+|should\s+be\s+)?(?:between|from)\s*(\d{1,3})\s*(?:and|to|-)\s*(\d{1,3})/i.exec(s);
      if (m) {
        out.push({ id: "age_range", kind: "age", label: "Age between " + m[1] + " and " + m[2], min: Number(m[1]), max: Number(m[2]), question: "How old are you, in completed years?", quote: verbatim(s) });
      } else {
        var m3 = /age\s+(?:is\s+)?(?:at least|above|not less than)\s*(\d{1,3})/i.exec(s);
        if (m3) out.push({ id: "age_min", kind: "age", label: "Age at least " + m3[1], min: Number(m3[1]), question: "How old are you, in completed years?", quote: verbatim(s) });
      }

      var m4 = /(?:resident|residing|domicile)\s+(?:of|in)\s+([A-Z][A-Za-z ]{2,30})/i.exec(s);
      if (m4) out.push({ id: "residency", kind: "residency", label: "Resident of " + cleanDocName(m4[1]), place: cleanDocName(m4[1]).toLowerCase(), question: "Which state do you live in?", quote: verbatim(s) });

      var m5 = /\bmust\s+(?:hold|have)\s+(?:a\s+)?([a-z ]{3,30}?card|aadhaar|ration card)/i.exec(s);
      if (m5) out.push({ id: "must_have", kind: "document", label: "Must hold: " + cleanDocName(m5[1] || "Aadhaar"), need: cleanDocName(m5[1] || "Aadhaar").toLowerCase(), question: "Do you hold this document?", quote: verbatim(s) });
    });
    return out;
  }

  function numberFrom(s) {
    return Number(String(s || "").replace(/[^\d.]/g, "")) || 0;
  }

  /* The verdict, with the condition that decided it. "Likely" is doing real work here:
   * the app read the conditions out of one document and knows nothing else. */
  function eligibility(conds, answers) {
    var list = conds || [];
    if (!list.length) {
      return { ok: false, reason: "no condition could be read out of that document, so eligibility cannot be judged from it" };
    }
    var a = answers || {};
    var failed = [];
    var met = [];
    list.forEach(function (c) {
      var v = a[c.id];
      if (v == null || v === "") { failed.push({ id: c.id, label: c.label, why: "not answered" }); return; }
      if (c.kind === "income") {
        var n = Number(v);
        var ok = c.id === "income_max" ? n <= c.limit : n > c.limit;
        (ok ? met : failed).push({ id: c.id, label: c.label, why: ok ? "your income is " + n : "your income is " + n + ", and the condition is \u201c" + c.label + "\u201d" });
      } else if (c.kind === "age") {
        var age = Number(v);
        var okAge = c.min != null && c.max != null ? age >= c.min && age <= c.max : age >= (c.min || 0);
        (okAge ? met : failed).push({ id: c.id, label: c.label, why: okAge ? "your age is " + age : "your age is " + age + ", and the condition is \u201c" + c.label + "\u201d" });
      } else if (c.kind === "residency") {
        var okPlace = String(v).toLowerCase().indexOf(c.place) >= 0;
        (okPlace ? met : failed).push({ id: c.id, label: c.label, why: okPlace ? "you live in " + v : "you live in " + v + ", and the condition is \u201c" + c.label + "\u201d" });
      } else {
        var okDoc = String(v).toLowerCase() === "yes" || String(v).toLowerCase() === "true";
        (okDoc ? met : failed).push({ id: c.id, label: c.label, why: okDoc ? "you hold it" : "you do not hold it, and the condition is \u201c" + c.label + "\u201d" });
      }
    });
    var unanswered = failed.filter(function (f) { return f.why === "not answered"; });
    var verdict = failed.length === 0 ? "likely eligible" : (unanswered.length === failed.length ? "not enough answered" : "likely not eligible");
    return {
      ok: true,
      verdict: verdict,
      met: met,
      failed: failed,
      verify: VERIFY,
      says: verdict === "likely eligible"
        ? "Likely eligible: every condition this document states is met by your answers. That is all this says \u2014 it read one document and knows nothing else about your case."
        : verdict === "likely not eligible"
          ? "Likely NOT eligible: " + failed.filter(function (f) { return f.why !== "not answered"; }).map(function (f) { return f.why; }).join("; ") + "."
          : "Not enough answered yet: " + unanswered.map(function (f) { return f.label; }).join("; ") + "."
    };
  }

  /* --------------------------------------------------------------- drafts */

  var TEMPLATES = [
    {
      id: "covering",
      label: "Covering letter for an application",
      body: function (f) {
        return [
          "To,",
          "The " + (f.authority || "[designated officer]") + ",",
          (f.office || "[office address]"),
          "",
          "Subject: " + (f.subject || "[subject of the application]"),
          "",
          "Sir / Madam,",
          "",
          "I am submitting an application in respect of " + (f.subject || "[the matter]") +
            (f.reference ? ", reference " + f.reference : "") + ".",
          "",
          "I am enclosing the following:",
          (f.documents && f.documents.length ? f.documents.map(function (d) { return "  - " + d; }).join("\n") : "  - [list the documents]"),
          "",
          "Kindly acknowledge receipt and inform me of the next step.",
          "",
          "Yours faithfully,",
          (f.name || "[your name]"),
          (f.contact || "[phone and address]"),
          "",
          "Note: " + VERIFY
        ].join("\n");
      }
    },
    {
      id: "rti",
      label: "Right to Information request",
      body: function (f) {
        return [
          "To,",
          "The Public Information Officer,",
          (f.authority || "[name of the public authority]"),
          "",
          "Subject: Request for information under the Right to Information Act, 2005",
          "",
          "Sir / Madam,",
          "",
          "Under section 6(1) of the Right to Information Act, 2005, I request the following information:",
          "",
          (f.subject ? "1. " + f.subject : "1. [state the information you want, as precisely as you can]"),
          "",
          "I am enclosing the application fee as required. Please inform me of any further fee payable, with the calculation.",
          "",
          "If any part of this request is refused, please cite the provision under which it is refused and the appellate authority.",
          "",
          "Yours faithfully,",
          (f.name || "[your name]"),
          (f.contact || "[address for reply]"),
          "",
          "Note: the fee, the format and the officer's title differ between authorities \u2014 check them against the official source. " + VERIFY
        ].join("\n");
      }
    },
    {
      id: "reply",
      label: "Reply to a notice",
      body: function (f) {
        return [
          "To,",
          "The " + (f.authority || "[issuing authority]") + ",",
          (f.office || "[office address]"),
          "",
          "Subject: Reply to notice" + (f.reference ? " " + f.reference : "") + (f.noticeDate ? " dated " + f.noticeDate : ""),
          "",
          "Sir / Madam,",
          "",
          "With reference to the notice" + (f.reference ? " bearing reference " + f.reference : "") +
            (f.noticeDate ? " dated " + f.noticeDate : "") + ", I wish to state the following:",
          "",
          (f.subject || "[your reply, point by point]"),
          "",
          "The documents relied upon are enclosed.",
          "",
          "Yours faithfully,",
          (f.name || "[your name]"),
          (f.contact || "[address for reply]"),
          "",
          "Note: " + VERIFY
        ].join("\n");
      }
    }
  ];

  function templateById(id) {
    for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i];
    return null;
  }

  function draft(id, fields) {
    var t = templateById(id);
    if (!t) return { ok: false, field: "template", reason: "there is no template called \u201c" + id + "\u201d" };
    var f = fields || {};
    var text = t.body(f);
    return {
      ok: true,
      text: text,
      template: t.label,
      verify: VERIFY,
      says: "A draft, not a filing. Edit it, check every detail against the official source, and submit it yourself \u2014 this app never submits anything."
    };
  }

  /* --------------------------------------------------------------- forms
   * A field is a label, a type and a value. The app learns labels, so the same answer
   * fills a different form that asks the same thing.
   */
  function normaliseLabel(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function learn(answers, label, value, opts) {
    var lab = String(label || "").trim();
    var val = String(value == null ? "" : value).trim();
    if (!lab) return { ok: false, field: "label", reason: "a field with no label cannot be learned: the next form would not know what it is" };
    if (!val) return { ok: false, field: "value", reason: "an empty value was not learned" };
    var key = normaliseLabel(lab);
    var next = (answers || []).slice();
    var existing = next.filter(function (a) { return a.key === key; });
    if (existing.length) {
      /* Two answers for the same label are BOTH kept: silently resolving them would pick
       * one on the person's behalf. */
      next.push({ key: key, label: lab, value: val, at: (opts && opts.at) || 0 });
      return { ok: true, answers: next, duplicate: true, says: "Kept both answers for \u201c" + lab + "\u201d: on the next form you will be offered both rather than one being chosen for you." };
    }
    next.push({ key: key, label: lab, value: val, at: (opts && opts.at) || 0 });
    return { ok: true, answers: next, duplicate: false, says: "Learned \u201c" + lab + "\u201d." };
  }

  /* Filling: an exact label match or nothing. A near-miss filled into a government form is
   * worse than a blank. */
  function fillForm(labels, answers) {
    var list = (labels || []).map(function (l) { return String(l || "").trim(); }).filter(Boolean);
    if (!list.length) return { ok: false, reason: "there are no fields to fill: paste the form's labels, one per line" };
    var byKey = {};
    (answers || []).forEach(function (a) {
      byKey[a.key] = byKey[a.key] || [];
      byKey[a.key].push(a);
    });
    var rows = list.map(function (label) {
      var hits = byKey[normaliseLabel(label)] || [];
      return {
        label: label,
        value: hits.length === 1 ? hits[0].value : "",
        options: hits.map(function (h) { return h.value; }),
        state: hits.length === 0 ? "blank" : hits.length === 1 ? "filled" : "choose"
      };
    });
    var filled = rows.filter(function (r) { return r.state === "filled"; }).length;
    var blanks = rows.filter(function (r) { return r.state === "blank"; }).map(function (r) { return r.label; });
    var choose = rows.filter(function (r) { return r.state === "choose"; }).map(function (r) { return r.label; });
    return {
      ok: true,
      rows: rows,
      filled: filled,
      blank: blanks,
      choose: choose,
      says: filled + " of " + rows.length + " field(s) filled from what you have learned. " +
        (blanks.length ? blanks.length + " left visibly blank (" + blanks.join(", ") + "): a wrong answer on a form is worse than a missing one. " : "") +
        (choose.length ? choose.length + " offer more than one learned answer (" + choose.join(", ") + "). " : "") +
        "Nothing was submitted: this app fills fields and stops."
    };
  }

  /* ---------------------------------------------------------------- track */

  function addApplication(list, app) {
    var title = String((app && app.title) || "").trim();
    if (!title) return { ok: false, field: "title", reason: "an application with no title cannot be tracked" };
    var row = {
      id: "app" + ((list || []).length + 1) + "-" + ((app && app.at) || 0),
      title: title,
      reference: String((app && app.reference) || "").trim(),
      status: String((app && app.status) || "submitted"),
      next: String((app && app.next) || "").trim(),
      due: String((app && app.due) || "").trim(),
      at: (app && app.at) || 0
    };
    return { ok: true, applications: (list || []).concat([row]), row: row, says: "Tracking \u201c" + title + "\u201d." };
  }

  /* --------------------------------------------------------------- storage */

  function serializeState(state) {
    return JSON.stringify({
      version: VERSION,
      savedOn: (state && state.savedOn) || 0,
      answers: ((state && state.answers) || []).slice(),
      applications: ((state && state.applications) || []).slice(),
      drafts: ((state && state.drafts) || []).slice()
    }, null, 2);
  }

  /* A partial set is loaded with the missing labels NAMED, and an unreadable one is
   * reported rather than written over. */
  function parseState(text) {
    var raw = String(text == null ? "" : text);
    if (!raw.trim()) return { ok: false, reason: "there is nothing saved yet", raw: raw };
    var data;
    try { data = JSON.parse(raw); }
    catch (e) {
      return { ok: false, reason: "the saved answers are not readable JSON. They were not written over \u2014 export them to keep them, or start again deliberately.", raw: raw };
    }
    if (!data || (!Array.isArray(data.answers) && !Array.isArray(data.applications))) {
      return { ok: false, reason: "the saved file has neither answers nor applications in it, so it was not used \u2014 and it was not replaced with a blank one.", raw: raw };
    }
    var answers = [];
    var missing = [];
    (Array.isArray(data.answers) ? data.answers : []).forEach(function (a) {
      if (!a || !a.label) { missing.push("(a label with no name)"); return; }
      if (a.value == null || a.value === "") { missing.push(a.label); return; }
      answers.push({ key: normaliseLabel(a.label), label: String(a.label), value: String(a.value), at: Number(a.at) || 0 });
    });
    return {
      ok: true,
      state: {
        version: data.version || VERSION,
        savedOn: Number(data.savedOn) || 0,
        answers: answers,
        applications: Array.isArray(data.applications) ? data.applications : [],
        drafts: Array.isArray(data.drafts) ? data.drafts : []
      },
      missing: missing,
      raw: raw
    };
  }

  /* ---------------------------------------------------------------- export */

  function stamp(when) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(when || ""));
    return m ? m[3] + "-" + m[2] + "-" + m[1] : "undated";
  }

  function explainMarkdown(ex, meta) {
    var lines = ["# What this document asks for", ""];
    if (meta && meta.when) lines.push("Read " + meta.when + ".");
    lines.push("");
    lines.push("> " + VERIFY);
    lines.push("");
    lines.push("## Documents it asks for");
    if (!ex.documents.length) lines.push("", "None found in the text.");
    ex.documents.forEach(function (d) { lines.push("- **" + d.name + "** (" + d.kind + ") \u2014 \u201c" + d.quote + "\u201d"); });
    lines.push("", "## Dates in the document");
    if (!ex.dates.length) lines.push("", "None found.");
    ex.dates.forEach(function (d) { lines.push("- " + d.text + " \u2014 \u201c" + d.context + "\u201d"); });
    lines.push("", "## Amounts");
    if (!ex.fees.length) lines.push("", "None found.");
    ex.fees.forEach(function (f) { lines.push("- " + f.text + " \u2014 \u201c" + f.context + "\u201d"); });
    lines.push("", "## Deadlines");
    if (!ex.deadlines.length) lines.push("", "None found.");
    ex.deadlines.forEach(function (d) { lines.push("- " + d.text + " \u2014 \u201c" + d.context + "\u201d"); });
    lines.push("", "Every line above was found in the text you pasted. Nothing was interpreted by a model.");
    return lines.join("\n");
  }

  function exportFile(what, payload, meta, writer) {
    meta = meta || {};
    if (typeof writer !== "function") return { ok: false, reason: "the file was not written: no writer is available in this browser" };
    var name, body, mime = "text/plain;charset=utf-8";
    if (what === "explain") { name = "paperwork-explained-" + stamp(meta.when) + ".md"; body = explainMarkdown(payload.explain, meta); mime = "text/markdown;charset=utf-8"; }
    else if (what === "draft") { name = "paperwork-draft-" + stamp(meta.when) + ".txt"; body = String(payload.text || ""); }
    else if (what === "filled") { name = "paperwork-filled-" + stamp(meta.when) + ".txt"; body = filledText(payload.fill); }
    else if (what === "raw") { name = "paperwork-unreadable-" + stamp(meta.when) + ".txt"; body = String(payload.raw || ""); }
    else return { ok: false, reason: "nothing was written: unknown export \u201c" + what + "\u201d" };
    try {
      var wrote = writer(name, body, mime);
      if (wrote === false) return { ok: false, filename: name, reason: "the file was not written: the browser refused the save" };
      return { ok: true, filename: name, bytes: body.length };
    } catch (e) {
      var why = e && e.name === "QuotaExceededError" ? "storage is full" : (e && e.message ? e.message : "storage is unavailable");
      return { ok: false, filename: name, reason: "the file was not written: " + why };
    }
  }

  function filledText(fill) {
    var lines = ["Filled form \u2014 edit before you use it", ""];
    (fill.rows || []).forEach(function (r) {
      lines.push(r.label + ": " + (r.state === "filled" ? r.value : r.state === "choose" ? "[choose one: " + r.options.join(" / ") + "]" : "[blank \u2014 no learned answer]"));
    });
    lines.push("");
    lines.push("Nothing was submitted. " + VERIFY);
    return lines.join("\n");
  }

  return {
    version: VERSION,
    VERIFY: VERIFY,
    TEMPLATES: TEMPLATES,
    sentences: sentences,
    documents: documents,
    dates: dates,
    fees: fees,
    deadlines: deadlines,
    explain: explain,
    conditions: conditions,
    eligibility: eligibility,
    templateById: templateById,
    draft: draft,
    normaliseLabel: normaliseLabel,
    learn: learn,
    fillForm: fillForm,
    addApplication: addApplication,
    serializeState: serializeState,
    parseState: parseState,
    explainMarkdown: explainMarkdown,
    filledText: filledText,
    exportFile: exportFile
  };
});

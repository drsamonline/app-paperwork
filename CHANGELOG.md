# Changelog

All notable changes to Paperwork are recorded here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates: dd/mm/yyyy.

## [Unreleased]

## [1.0.0] — 25/11/2026

### Added
- **Explain**: paste a notice, circular, form or letter and get the documents it asks for, the
  dates, the amounts and the deadlines — each with a verbatim quote of the sentence it came from,
  so every line can be found again in the text.
- **Eligibility**: the conditions are read out of the document (income, age, residency, a required
  document) and put to the person as questions. The verdict is *likely eligible* or *likely not
  eligible* with the condition that decided it; unanswered conditions are never counted as met.
  With no condition found, the app refuses to guess.
- **Draft**: three templates — a covering letter, an RTI request citing section 6(1) of the RTI Act
  2005, and a reply to a notice — pre-filled with the documents the notice asked for, editable
  before export, and carrying the verify line.
- **Forms**: answers learned by field label and reused on any form that asks the same thing. A field
  with no learned answer stays visibly blank; two answers for one label are both offered, never
  silently resolved. Nothing is ever submitted.
- **Tracking**: a local list of applications with status and next action.
- The verify line on every panel, generated from one string in the engine so the page and the
  exports cannot drift apart.
- Refusals: an empty paste, a form with no labels, a field with no label or no value, an unknown
  template, a titleless application.
- Corruption handling: an unreadable set is reported and offered for export, never written over; a
  partial set loads with the missing labels named.
- PWA shell, CI (102 engine assertions + 51 in jsdom + page smoke), and the app-builder pipeline
  pinned to the canonical SHA for the EXE/APK/Linux release.

### Not built
- OCR: the text is pasted, not photographed.
- The LLM that would explain a document in its own words: the app quotes the document instead.

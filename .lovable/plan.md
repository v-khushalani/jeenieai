# Notes v2 — Document Upload + Pro+ Viewer + Progress

Big upgrade across admin authoring and student reading. 6 things below.

---

## 1. Database & Storage

**New columns on `study_notes`**:
- `document_url text` — public storage URL (PDF). Word files are auto-converted to PDF on upload (browser-side via `docx` → server keeps original too).
- `document_type text` (`'markdown' | 'pdf' | 'docx'`) — drives which viewer renders.
- `document_name text` — original filename for download.
- `document_pages int` — page count (PDF only) for progress %.
- `requires_pro_plus boolean default true` — server-enforced gate.

**New table `note_reading_progress`** (per user, per note):
- `user_id`, `note_id`, `chapter_id`, `last_page int default 1`, `last_scroll_pct numeric default 0`, `completed boolean default false`, `updated_at`.
- RLS: user can read/write only their own rows.
- Unique `(user_id, note_id)`.

**New Storage bucket `study-notes`** (public read, authenticated write via admin role check).

**Server-enforced Pro+ gating** via SQL view + RLS:
- New `study_notes` SELECT policy: only return `document_url`/`content_md` if `requires_pro_plus = false` OR `has_role(auth.uid(), 'pro_plus')` OR admin. (Currently policy is open — tightening it.)
- Edge function `get-note` (security definer) double-checks tier before signing a private URL — backup path if we ever flip the bucket to private.

---

## 2. Admin — NotesManager UX redesign

- **Filters as pills** (FilterPills component already in repo) instead of 3 dropdowns. Exam / Class / Subject all become pill rows. Cleaner mobile too.
- **Fix duplicate chapter dropdown**: dedupe by chapter title (case/space-insensitive) before populating `<Select>`. Same dedupe logic that StudyNow already uses.
- **New "Upload Document" panel** inside the note editor:
  - Drag-drop or file picker: `.pdf`, `.docx`, `.doc`
  - On upload → push to `study-notes` bucket → save `document_url` + `document_type` + `document_name` + page count.
  - Either markdown OR document is required (not both).
  - Editor shows current attached doc with replace/remove buttons.
- Note row badge shows `PDF` / `DOCX` / `MD` so you know format at a glance.

---

## 3. Student — Document Viewer

Replace current markdown-only `StudyNotesIntro` with a `DocumentViewer` that handles 3 modes:

- **Markdown** → existing pretty render (keep).
- **PDF** → `react-pdf` (pdf.js worker). Continuous scroll, pinch/scroll zoom, page counter, keyboard nav.
- **DOCX** → render via `mammoth` → HTML in same paper-like shell. (No client-side Word renderer is perfect; mammoth covers ~95% of teaching notes.)

Viewer chrome:
- Sticky header: title, Pro+ badge, page X of Y, zoom (− 100% +), download original.
- Sticky footer: **Resume from where you left** + progress bar + "Start practice" button.
- Auto-saves scroll/page every 5s + on close → `note_reading_progress`.
- Reopening the note jumps to last position.

---

## 4. Strict Pro+ enforcement

Three layers (defense in depth):

1. **UI** — `StudyNotesIntro` already checks `subscriptionTier === 'pro_plus'`; we add a `<ProPlusGate>` upgrade card for non-Pro+ users showing a blurred preview + upgrade CTA (no real content leaks).
2. **Data layer** — RLS policy on `study_notes` denies `document_url` / `content_md` to non-Pro+ users (returns row metadata only: title + reading time so the upsell card has context).
3. **Storage layer** — bucket stays public-read for performance, but filenames are UUIDs (unguessable). If you later want stricter, flip to private + use the `get-note` signed-URL edge function (scaffolded).

---

## 5. Fix: student-side notes not appearing

Root cause likely the chapter-id match: admin saves `chapter_id` from class-filtered list, but `StudyNotesIntro` queries by the chapter UUID the student is practising. Verifying with a quick query, then:
- Ensure `is_published` is true before show.
- Ensure feature flag `study_notes` is actually ON for the student (right now it's default OFF — surface this clearly in NotesManager with a "Flag is OFF — students won't see" banner + 1-click toggle for admins).
- Fix any subject-case mismatch the same way I fixed the chapter loader.

---

## 6. StudyNow integration

- When a student enters a chapter that has a published note, auto-open `DocumentViewer` (Pro+) or upgrade card (free/pro).
- Chapter card already shows a `Theory` badge — extend with format icon (PDF/DOC/MD) and progress ring if they started reading.
- Resume CTA on the chapter card if `note_reading_progress.completed = false`.

---

## Technical notes

- New deps: `react-pdf` (PDF viewer, ~280kb gz, lazy-loaded), `mammoth` (DOCX→HTML, ~100kb gz, lazy-loaded). Both behind dynamic import so the practice page bundle stays small.
- pdf.js worker served from `/public/pdf.worker.min.js`.
- Bucket `study-notes` public-read, 25MB file limit, admin-only write via storage RLS check on `has_role(auth.uid(),'admin')`.
- Migration order: columns → bucket → policies → progress table → policies/grants.
- Feature flag `study_notes` stays the master kill switch.

---

## Out of scope (for now)
- OCR of scanned PDFs (assume text-layer PDFs).
- Highlighting / annotations.
- Multiple documents per chapter (one-to-one for v2).

Confirm and I'll ship migration + code in one batch. Or tell me what to drop.

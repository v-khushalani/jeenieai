# Launch Readiness: Class 6-10 Content Pipeline, Feature Cleanup, Audit, Community

## Verified current state

Numbers below come from live database queries just now.

- Active questions: **69,415** — Class 11: 21,270, Class 12: 48,124, 21 with no grade/chapter.
- Of those, **16,082 (23%) are marked `damaged`** by our text-quality checker. They are still active, so students are being shown broken/garbled questions today. 53,325 are `ok`.
- Questions with an image attached: 6,447 (11th + 12th).
- **Foundation Class 6, 7, 8, 9, 10: chapters exist (30/32/34/30/31) but 0 questions.** So every Foundation batch is an empty shell right now.
- Content tables that are empty or near-empty: `study_notes` = 0, `concept_maps` = 0, `educator_content` = 4 items, `reward_store_items` = 6.
- All 23 feature flags are currently ON, including `study_notes` which has no content behind it.
- PYQ-tagged questions: 17,365.

---

## 1. CSV question pipeline v2 (with diagrams, works for Class 6-10)

The current template has only 14 text columns and no image support. Replace it with a full template.

New template columns:

```text
grade, subject, chapter, topic, question_type, difficulty,
question, question_image_url,
option_a, option_a_image_url,
option_b, option_b_image_url,
option_c, option_c_image_url,
option_d, option_d_image_url,
correct_answer, numerical_answer, numerical_tolerance,
explanation, explanation_image_url,
is_pyq, pyq_year, pyq_exam, exam_relevance, source
```

How diagrams work — two supported ways, both in one flow:

1. **Image folder upload** — you put a `question_image` / `option_a_image` filename in the CSV (e.g. `q101.png`), then drag the whole image folder into the uploader. Files are uploaded to a `question-images` storage bucket and matched by filename. This is the practical route for a content team working in Excel.
2. **Direct URL** — if the image is already hosted, paste the URL in the same column.

Other pipeline changes:

- Grade column drives the batch: choose the batch once in the UI, and rows whose `grade` conflicts are flagged rather than silently imported.
- Chapter/topic auto-match against existing chapters; unknown chapter names can be auto-created (with a checkbox) instead of failing the row — needed because Class 6-10 topics are mostly unpopulated.
- Support all four question types: single_correct, multi_correct, numerical, assertion_reason.
- Duplicate detection via the existing content hash so the same question never enters twice.
- Row limit raised from 500 to 2,000 with chunked insert; larger files are split automatically.
- Live preview panel stays, and now also renders option images so you can spot a broken diagram before approving.
- `.xlsx` upload accepted in addition to `.csv`.

Everything still lands in the review queue first, then promotes to live questions.

---

## 2. Things that are defective — turn these OFF before launch

Recommended flags to switch off (my honest list, based on what is actually backed by data):

| Flag | Why off |
|---|---|
| `study_notes` | 0 notes and 0 concept maps in the database. Every chapter shows an empty panel. |
| `virtual_lab` | Simulation hosting is fragile and only a handful of assets exist. |
| `educator_content` | Only 4 items across all grades — a library with 4 files looks abandoned. |
| `battle_mode` | Needs concurrent online users. With 0 users at launch, every battle times out. |
| `wrapped_yearbook` / `snapshot` | Recap of a year with no history produces empty cards. |
| `roast_meme` | High risk of tone-deaf output in front of parents on day 1. Re-enable after we see real usage. |
| `leaderboard` | With a handful of students a leaderboard exposes how small the base is. Enable at ~200 active users. |

Keep ON: study_now, test_mode, study_planner, ai_doubt_solver, badges, badge_celebration, test_history, group_tests, analytics, pricing_plans, referral_system, share_card, install_app_prompt, push_notifications.

Additionally, empty states will show a Coming Soon banner instead of a broken screen wherever a flag stays on but content is thin.

---

## 3. Full content and dead-end audit

- **Quarantine damaged questions**: set the 16,082 `damaged` rows to inactive so students only ever see the 53,325 clean ones, then run them through the repair pipeline in batches and re-activate as they pass. This is the single biggest quality win available today.
- Fix the 21 questions with no chapter/grade.
- Per-chapter coverage report: every chapter with fewer than 10 usable questions gets flagged and hidden from practice/test selection so no student hits "no questions available".
- Route sweep across all six roles (free, pro, pro+, educator, admin, super admin) for dead links, empty screens and failing loads, delivered as a written report.
- Output: an admin "Content Health" screen showing usable vs hidden questions per grade, subject and chapter, so this stays visible after launch.

---

## 4. Community (new feature)

A grade-scoped study discussion space.

- Students see a feed for **their own grade + goal** (e.g. Class 11 JEE). No cross-grade noise.
- Post types: **Doubt**, **Discussion**, **Resource**. A doubt can attach an image (photo of a sum) and optionally a linked question from our bank.
- Threaded replies, upvotes, and a "Solved" mark by the original poster.
- Answering earns JEEnie Points; an accepted answer earns more. This ties community into the existing points economy instead of creating a new currency.
- Moderation: report button, admin moderation queue, auto-hide after N reports, educators get a verified badge on their replies.
- Free users can read and reply; posting a doubt has a daily cap, unlimited for Pro.
- Tables: `community_posts`, `community_replies`, `community_votes`, `community_reports`, all with RLS restricted to authenticated users and grade filtering, plus an admin moderation policy.

---

## 5. Market research and launch strategy

I have not yet verified the Tayyari app's actual feature set, so before writing the positioning I will research it properly and report findings rather than guess. Research covers:

- Target Publications' Tayyari — features, pricing, review sentiment, what they do well.
- The direct comparison set: Physics Wallah, Allen Digital, Unacademy, Vedantu, Doubtnut, Marks (MARKS app), Embibe.
- Where a small player realistically wins: hyper-local (Maharashtra CET + JEE/NEET), Hinglish mentor tone, and a habit loop nobody else has.

Then a written launch plan covering: pricing check against competitors, first-100-students acquisition (coaching tie-ups, school tie-ups, WhatsApp/Telegram groups, Instagram reels of the mascot), the referral engine, and a week-by-week launch calendar. Plus a brutally honest verdict on whether we launch this week or hold.

---

## Suggested execution order

1. Quarantine damaged questions + content health audit (protects every student who signs up).
2. Feature flag cleanup.
3. CSV pipeline v2 so you can start filling Class 6-10 immediately.
4. Community.
5. Market research report and launch calendar.

## Technical notes

- New storage bucket `question-images` (public read, admin write) plus a migration adding `option_a_image_url`..`option_d_image_url` and `explanation_image_url` to `questions`, all nullable — additive only, nothing breaks.
- `BulkCsvUploader.tsx` gains a folder-drop image step and chunked insert; `QuestionLivePreview.tsx` extended to render option images.
- Damaged-question quarantine runs as a data update, reversible per-row as repairs pass.
- Community adds four tables with GRANTs + RLS, a feed page, and an admin moderation tab.

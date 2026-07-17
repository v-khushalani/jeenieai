
# Teen problems, teen fixes — co-founder mode

## 1. QUESTION REPEATS — root cause + strict fix

### Kya ho raha hai (honest diagnosis)

Repeat 3 jagah se leak ho raha hai:

1. **Client-side dedup on a capped pool.** `PracticePage.fetchQuestions` question table se `.limit(500)` pool laata hai, phir client pe `attemptedIds` se filter karta hai. Agar user ne us chapter ke 500 me se kuch attempt kar liye, aur DB me aur bhi hain — no problem. Lekin agar attempts kabhi insert fail hue (network, RLS, dupe key), to woh id `question_attempts` me nahi hai → same question wapas serve ho jaata hai.
2. **Fallback branches** (lines 358, 373, 390 in `PracticePage.tsx`) dedup toh karte hain, lekin **server-side `not.in` filter nahi hai**. Agar attempted list 500+ hai to client filter ke baad pool khaali ho jaata hai aur fallback bhi wahi 500 attempted rows laata hai — cycle.
3. **TestPage** (`getAttemptedQuestionIds`) sirf `question_attempts` dekhta hai. Lekin ek hi test session me question do baar aa sakta hai agar cross-subject batches merge hote waqt dedup key subject-scoped ho jaati hai. Aur test-session ke andar-hi-andar dedup nahi hai (ek hi test me repeat).
4. **No DB-level guarantee.** `question_attempts` pe `UNIQUE(user_id, question_id, mode)` constraint nahi hai — silent duplicate insert allowed hai, aur "already attempted" ka source of truth soft hai.

### Strict fix (isko hardcode kar denge)

- **DB level:**
  - `CREATE UNIQUE INDEX` on `question_attempts(user_id, question_id)` (across all modes — jo bhi question ek baar dekha, dobara kabhi nahi).
  - New RPC `fetch_unseen_questions(user_id, filters, limit)` — Postgres side pe `NOT EXISTS` join se sirf unseen ids return kare. Client filtering hatao.
  - New table `served_questions(user_id, question_id, session_id, served_at)` — jaise hi question **serve** hoti hai (submit se pehle), yahan insert. Isse "user ne dekha but submit nahi kiya" wale bhi repeat nahi honge.
- **Client:**
  - `PracticePage` aur `TestPage` dono `fetch_unseen_questions` RPC use karein. Client dedup as safety net only.
  - Test session ke andar `usedIds` Set maintain — same test me question repeat impossible.
- **Fallback rule:** agar unseen pool khatam ho jaaye, "You've completed this chapter" screen dikhao + suggest next chapter. **Kabhi bhi seen question wapas nahi.**
- **Revisit mode** (`isRevisit`) sirf explicit "Revise wrong answers" flow me chalega — default nahi.

### Files

- New migration: unique index + `fetch_unseen_questions` RPC + `served_questions` table
- `src/pages/PracticePage.tsx` — swap fetch to RPC
- `src/pages/TestPage.tsx` — swap fetch to RPC + in-session `usedIds`
- `src/pages/StudyNowPage.tsx` — same RPC path

---

## 2. PERCENTILE — abhi kya hai vs kya hona chahiye

### Abhi ka formula (from `compute-coach-signal/index.ts`)

```text
base = 55
gain = accuracy*22 + consistency*12 + coverage*6 + avgMastery*8 + trend*±2
percentile = clamp(35..99.5, base + gain)
```

Ye **dummy** feel isliye deta hai:
- Base 55 hardcoded — koi bhi banda app open kare, 55 se kam nahi.
- `accuracy` = last 30 days ke sabhi attempts ka avg. Easy questions bhi 1 unit, JEE Adv PYQ bhi 1 unit — no weightage.
- Coverage: sirf 3 subjects touch karne pe max — matlab ek chapter ke 5 easy Q + doosre subject ke 5 easy Q = full coverage credit.
- Peer comparison **zero** — actual "percentile" ka matlab hi hai "kitne % students se aage ho". Yahan koi peer data nahi use ho raha.

### Honest percentile v2

Do options — tu decide:

**Option A: "Predicted Rank Band" (recommended, low infra)**
- Naam hi badal — "Predicted Rank Band: 2000–4000" instead of "91.2 percentile". Honest hai, dummy nahi lagta.
- Formula: har chapter ka JEE weightage × user's mastery × PYQ accuracy → expected marks. Expected marks → historical rank curve (static JSON of JEE 2023/24 marks-vs-rank).
- Confidence badge: Low (< 100 attempts), Medium (100–500), High (500+).

**Option B: True percentile (needs peer aggregation)**
- Aggregate table `user_daily_stats` (already partially exists via `daily_progress`). Nightly job: compute each user's `expected_marks`, rank sabko, store percentile.
- User dekhta hai: "Tu top 8.8% me hai (12,340 active JEE 2026 students me se)."
- Requires: min 1000 active users for stat to be meaningful; till then, fallback to Option A with a "Beta" tag.

### Recommendation

Ship **Option A now** + start collecting peer aggregate for Option B in background. Rename UI se `percentile` word hata do jab tak Option B ready nahi — "Predicted JEE Rank" zyada credible feel deta hai.

---

## 3. AI PLANNER — co-founder redesign

### Sach bolun to abhi ka planner kya galat hai

- **3 alag mental models** — Roadmap (strategic), AI Planner mission blocks (tactical), Study Now (raw practice). Student confused: "kahan se start karun?"
- **Coach vibe missing.** Text hai, emojis hain, lekin koi **decision tu student ke liye nahi le raha**. Har jagah 4 buttons, 6 cards.
- **No feedback loop that feels alive.** Question solve karo → mission update → done. But **kya seekha**, **kal kya**, **iska rank pe kya impact** — silent.
- **Zero stakes.** Streak break ho ya na ho, kuch bada nahi hota. Competitive angle sirf ek strip me hai.

### Best version (mera pitch)

**Ek hi flow, ek hi screen, ek hi CTA at a time.**

```text
┌──────────────────────────────────────────────┐
│ 🔥 Streak: 12d   Rank: 3,200 ↑42   Day 187/487│  ← sticky
├──────────────────────────────────────────────┤
│                                              │
│   AAJ KA MISSION                             │
│   ─────────────                              │
│   Thermodynamics · Weak fix                  │
│   10 Q · ~18 min · Pass @ 6/10               │
│                                              │
│   [   ▶  START  (biggest button on screen)  ]│
│                                              │
│   ↓ tap for details                          │
│   Kal ka teaser: Rotation PYQ marathon       │
├──────────────────────────────────────────────┤
│  Progress today:  ●●○○○  (2/5 blocks)        │
│  Next 2 blocks: [Rotation revision] [5 PYQ]  │
├──────────────────────────────────────────────┤
│  📖 Full roadmap  ·  📊 My stats  ·  🏆 Rank │
└──────────────────────────────────────────────┘
```

**Rules for the "co-founder" version:**

1. **One decision at a time.** Sirf "aaj ka current block" hero pe. Baaki blocks stack me chhote.
2. **Every block has stakes.**
   - Pass criteria clear: "6/10 = +0.4 percentile, 3 din streak safe."
   - Fail feel real: "3/10 hua = chapter ko phir se schedule karenge kal."
3. **Live coach commentary** — question solve karte waqt mini toast: "Bhai, thermodynamics me tu 78% pe hai — 2 aur sahi = mastery unlock 🔓."
4. **Curiosity hooks after block completion:**
   - Live rank ticker jump (3,242 → 3,200 with animation)
   - "Tera dost Aryan ne aaj 2 blocks kiye — tu 3 pe hai 🔥" (if friends feature on)
   - "Kal ka block preview" (locked/blurred, unlocks tomorrow)
5. **Roadmap becomes a "map" view, not a competitor screen.** Ek "Zoom out" button — dikhata hai poora syllabus with today's block highlighted as "You are here." Roadmap is not a separate feature — it's the map behind today's mission.
6. **Weekly boss fight** — har Sunday ek "Boss test" (30 Q from week's chapters). Beat karo → percentile jump animation + shareable card.
7. **Streak with real consequence.** Streak break = rank prediction gir jaata hai visibly (3,200 → 3,600). Isse dar lagta hai, motivation ke saath.

### Implementation slices (proposed, need approval)

- **Slice 1: Single-focus mission screen.** Rebuild `CoachMissionPanel` — hero block + stacked mini blocks + live commentary hook. Kill sabhi secondary cards.
- **Slice 2: Real stakes.** Block completion → animated rank jump + toast. Block fail → auto-reschedule tomorrow.
- **Slice 3: Weekly boss test.** New edge fn `generate-weekly-boss` + `WeeklyBossCard.tsx`.
- **Slice 4: Roadmap as map.** RoadmapView becomes zoomed-out view of today's position, not separate tab.

Out of scope for now: friends leaderboard, live multiplayer, notifications infra.

---

## What I need from you before I build

1. **Repeats fix:** unique index across all modes (including tests) OK? Ya tests me repeat OK rakhna hai (kyunki mock tests me PYQ dobara aana valid hota hai)?
2. **Percentile:** Option A (Predicted Rank Band, ship this week) ya Option B (true peer percentile, needs 2 weeks + peer data)?
3. **Planner:** Full redesign (slice 1+2 first, slice 3+4 next week) — green light?

Approve karo, main teenon build karta hoon strict order me: repeats → percentile → planner.

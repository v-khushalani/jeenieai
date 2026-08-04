# AI Planner v2 + JEEnie "Bada Bhai" Answers

Do cheezein theek karni hain: planner ka structure (bohot layers, kam maza) aur JEEnie ke jawab (formal, patle).

---

## Part 1 — AI Planner: abhi kya hai

`/ai-planner` par teen alag dimaag ek page par chipke hain:

1. **CoachMissionPanel** — daily mission (blocks, prep mode, minutes setup, live auto-tick).
2. **AIStudyPlanner** — tabs: Roadmap / This Week / Insights (alag hi engine `roadmapEngine.ts` + `studyPlannerCore.ts` se chalta hai).
3. **XP / streak bits** — mission ke andar chhupe hue.

Problem: do alag planning engines (mission blocks aur weekly plan) ek dusre ko nahi jaante, teen tabs, setup form pehle hi screen par, aur user ko ye samajh nahi aata ki "aaj karna kya hai".

## Part 1 — Best version (from scratch)

Ek hi mental model: **Aaj → Is Hafte → Poora Syllabus.** Ek screen, scroll karke neeche jitna deep chahiye utna.

```text
┌──────────────────────────────────────┐
│  🔥 7-day streak      ⚡ 120 XP today │  <- top strip, ek line
├──────────────────────────────────────┤
│  AAJ KA MISSION           2/4 done   │
│  ▓▓▓▓▓▓░░░░  progress                │
│                                      │
│  ✅ Rotational — 10 Qs      +20 XP   │
│  ✅ Thermo revision — 8 Qs  +15 XP   │
│  ▶  Organic SN1 — 12 Qs   [Start]    │  <- sirf agla task expanded
│  🔒 Mini mock — 15 Qs                │
├──────────────────────────────────────┤
│  IS HAFTE          32/60 questions   │  <- 7 dots, aaj highlighted
├──────────────────────────────────────┤
│  SYLLABUS JOURNEY            18%     │  <- collapsed, tap to open
└──────────────────────────────────────┘
```

Rules jo ise "maza aane wala" banayenge:

- **Ek engine.** Weekly plan aur mission alag-alag na banein — `generate-daily-mission` hi source of truth, weekly view usi ke past+future days ka roll-up.
- **Maximum 4 tasks/din.** Har task = ek chapter + question count + XP. Aur kuch nahi.
- **Sirf agla task khula.** Baaki collapsed one-liners. Text 80% kam.
- **Auto-tick live** (ye already kaam karta hai — rakhenge) + task poora hote hi XP toast aur agla task apne aap khul jaye.
- **Sab done ho gaya toh curiosity zinda rahe:** "Bonus round" unlock — 5 hard questions, double XP, optional. Aur kal ka teaser: "Kal: Electrostatics 💥".
- **Setup form hatao.** Pehli baar sirf ek sawaal: "Roz kitne minute?" (3 chips: 60 / 120 / 180). Prep mode auto, Settings mein badalne ka option.
- **Roadmap secondary.** "Syllabus Journey" — chapters ki ek lambi list with progress rings, sirf tap karne par khulti hai. Tabs khatam.
- **Insights tab hatao** — uski 2 kaam ki lines (weak subject, accuracy trend) top strip ke neeche chip ki tarah.

Result: 3 tabs + 2 engines → 1 scroll, 1 engine, aaj ka kaam pehli screen par.

## Part 2 — JEEnie doubt solver: kyun formal lag raha hai

Prompt file (`_shared/jeeniePrompt.ts`) mein personality toh sahi likhi hai, par uske neeche ke layers usko daba dete hain:

- **Default mode `quick`** — jab tak "why/kyun/derive" na likho, har jawab 2–4 sentence ka ban jaata hai.
- **Word caps bohot tight**: free ~100, pro ~220, pro+ ~350 words. Depth ki jagah hi nahi bachti.
- **Token budget bhi kam**: base 280/600/1000 × factor 0.3–0.9 → aksar 300–600 tokens.
- **"ON-POINT RULE"** har analogy, har "kyun", har trap-warning ko explicitly mana karta hai — yehi cheezein bada-bhai feel deti hain.
- **Koi few-shot example nahi.** Model ko sirf bataya gaya hai ki Hinglish bol, dikhaya nahi gaya kaise. Roast mode mein few-shot hai — isiliye roast achha lagta hai aur answers flat.
- Model `google/gemini-2.5-flash` fixed hai, Pro model ek env flag ke peeche band pada hai.

## Part 2 — Fix

- **Default mode `quick` → `steps`/`deep`.** Chhoti factual query par hi quick, warna concept walk-through.
- **Caps double**: ~200 / ~450 / ~700 words; token base 500 / 1000 / 1800. Student "short" bole tabhi chhota (ye detection already hai, rehne do).
- **ON-POINT RULE narrow karo** — "no padding" rakho, par analogy / ek "kyun" line / ek trap-warning explicitly ALLOW karo.
- **Answer skeleton do** (headings nahi, flow):
  1. Seedha answer / final value pehle.
  2. "Kyun" — ek intuition line, desi analogy ke saath.
  3. Kaam ka steps ya derivation.
  4. "Trap": is sawaal mein log kahan phaste hain.
  5. Ek line next step ("ab ye wala PYQ try kar").
- **3–4 few-shot examples** prompt mein daalo (ek numerical, ek concept "kyun", ek MCQ, ek chhota factual) — roast mode wale style mein. Yahi sabse bada difference layega.
- **Pro+ ke liye behtar model**: `google/gemini-3.6-flash` par shift, aur deep/master ke liye pro model flag on.
- Free tier chhota rahega, par flat nahi — usme bhi analogy + trap line.

## Technical notes

- `supabase/functions/_shared/jeeniePrompt.ts`: `PERSONALITY` (ON-POINT rule), `TEACHING` layer, `LENGTH` caps, `computeMaxTokens`, `detectMode` default, naya `FEWSHOT_ANSWERS` block.
- `supabase/functions/jeenie/index.ts`: model ids, `MAX_OUTPUT_TOKENS_CEILING`, pro-model routing.
- Planner: `src/components/planner/CoachMissionPanel.tsx` naye single-column layout ka base banega; `src/components/AIStudyPlanner.tsx` se tabs hatenge, Roadmap collapsible section ban jayega, Insights ki 2 lines top strip mein; `roadmapEngine`/`studyPlannerCore` sirf Syllabus Journey ke liye rahenge (weekly plan mission data se derive hoga).
- `generate-daily-mission` edge function: max 4 blocks, bonus-round block, kal ka teaser field.

## Order

1. JEEnie prompt overhaul (chhota, turant asar) — few-shots + caps + mode default.
2. Planner layout collapse: tabs hatao, single scroll, 4 tasks.
3. Mission engine trim + bonus round + kal ka teaser.
4. Playwright se pro+ account par dono verify.

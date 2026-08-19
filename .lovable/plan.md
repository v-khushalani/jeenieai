# AI Planner v3 — "The Challenge Engine"

Goal: planner ko JEEnie ka USP banana. No game-world, no cartoons, no new XP currency. Sirf **missions, challenges, targets aur virtual rewards** — jisse student roz wapas aaye aur progress ka nasha lage.

## Core rule
- Currency = **JEEnie Points** only (already in `profiles.total_points`). Mission rewards points dete hain, koi alag XP nahi.
- Flow = **one mission at a time, multiple missions per day.** Ek card, ek CTA. Complete karo → agla card unlock, chain aage badhti hai.

## The three concepts (pick one, ya mix)

### A. Daily Chain — "Aaj ka Rasta"
Din ek chain hai: 3–5 missions, ek ke baad ek unlock. Har mission ka apna target (e.g. "Rotational Motion — 8 questions, 70% accuracy"). Chain toot gayi to din adhoora, poori hui to **Chain Bonus** points + rare reward. Locked cards blurred, sirf agla card live. Addiction = "bas ek aur".

### B. Target Ladder — "Rank Contract"
Student ek contract sign karta hai (weekly target, e.g. "700 questions is month / 75% accuracy in Physics"). Planner har din us contract ke chhote tukde deta hai, aur live batata hai: kitna aage/peeche ho, kitne din ka margin bacha. Contract poora → **Reward Vault** unlock. Contract fail → downgrade, dobara sign karna padega. Addiction = commitment + loss aversion.

### C. Challenge Feed — "Roz naya Panga"
Missions ke saath rotating challenges: Speed Run (10 Q in 10 min), Perfect Streak (7 sahi lagataar), Comeback (pichli galtiyan sudharo), Weak Spot Hunt, Midnight Bonus. Ek time pe ek active challenge, complete hote hi agla reveal (surprise reveal animation). Addiction = variable reward / curiosity.

**Recommendation:** A ko backbone banao (daily chain = strict one-at-a-time), B ko upar ka layer (weekly contract = long-term hook), C ko chain ke andar spice (har chain me 1 surprise challenge card). Teeno ek hi engine se chalte hain.

## Virtual rewards (no real money)
- **JEEnie Points** — har mission ka fixed reward, chain complete pe bonus.
- **Reward Vault** — daily chain complete hone pe ek "vault card" khulta hai: points, streak freeze, badge shard, ya profile theme/frame.
- **Streak Freeze** — 1 din miss karne ki insurance, points se kharido. Ye retention ka sabse bada lever hai.
- **Titles & Frames** — profile pe dikhne wale cosmetic rewards ("Physics Slayer", gold frame) — badges system se link.
- **Rarity reveal** — vault card flip animation, rarity chances (common → legendary).

## Screen structure (single scroll, minimal text)
```text
[ Streak · Points · Contract progress bar ]
[ NOW: active mission card — big, one CTA "Start" ]
[ next 3 cards, locked/blurred, one unlocks at a time ]
[ Today's Vault (locked until chain done) ]
[ Weekly contract strip: ahead/behind by X ]
```
Har card max 2 lines text: kya karna hai + kyun.

## Technical details

**Data**
- Reuse `daily_missions` (blocks JSONB) — blocks ab strictly sequential, har block me `unlock_after`, `target` (questions + accuracy), `points_reward`.
- New tables: `user_contracts` (weekly/monthly target, status), `reward_vault_claims` (date, reward type, rarity), `user_inventory` (streak freezes, titles, frames). Sab RLS + GRANTs ke saath.
- Points award server-side only — new security-definer RPC `award_mission_points(mission_id, block_id)` jo double-claim rokta hai aur `profiles.total_points` update karta hai. Client se direct points update nahi.

**Logic**
- `generate-daily-mission` edge function rewrite: chain of 3–5 blocks, priority = mastery gap × exam weightage × recency (existing `roadmapEngine.ts` scoring), grade-filtered, plus 1 challenge block from a rotating pool.
- Live sync: existing `bump_mission_progress_by_chapter` RPC + realtime subscription per mission — block auto-tick jaise hi practice me questions solve hote hain.
- Contract evaluation: daily cron-less approach — contract progress compute on read from attempts, status finalize on expiry date.

**Frontend**
- `AIStudyPlanner.tsx` ko chhote components me todna: `MissionChain.tsx`, `MissionCard.tsx`, `RewardVault.tsx`, `ContractStrip.tsx`.
- `InteractiveStudyLadder.tsx` / `RoadmapView.tsx` ek secondary "Syllabus" tab me shift — planner ka default view chain hi rahega.
- Framer-motion: unlock slide, auto-tick check, vault flip. Design tokens only, existing navy premium aura maintain.
- Pro/Pro+ gating aur `PremiumGate` jaisa hai waisa hi rahega.

## Build order
1. DB migration (contracts, vault, inventory, award RPC).
2. Mission chain generator rewrite + live sync verify.
3. Chain UI + one-at-a-time unlock.
4. Reward vault + streak freeze + titles.
5. Weekly contract strip.

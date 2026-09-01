# Full Role-by-Role Audit + Fix Pass

Goal: log in as every role, exercise every feature end-to-end, fix whatever breaks, and polish the rough UX edges — with the educator animation/simulation flow as a named priority.

## How it runs

Scripted Playwright passes against the running preview, using the seeded `@jeenie.website` accounts (`Test@1234`). Every screen captures screenshots, console errors and failed network calls. Fixes are applied as issues are found, then the affected flow is re-run to confirm.

### 1. Free user (`user@`)

Signup/goal flow, dashboard, Study Now, Practice — solve 50+ questions across subjects checking: no repeats, correct render (LaTeX/images), timer, XP/points toast, streak update, attempt rows landing in the DB. Daily limit + upgrade prompt, AI doubt quota, badges, leaderboard, community feed, profile, settings.

### 2. Pro (`pro@`)

Everything above unlocked, plus: AI Planner (mission generate → start → auto-tick as questions are solved), Journey/ladder (grade filter, no duplicate chapters), full test cycle — create → attempt → submit → results → history — for at least 3 tests, analytics numbers matching attempt data, doubt solver depth and tone.

### 3. Pro+ (`proplus@`)

Pro+ library (presentations + Interactive Animations), simulation launch and interaction, group test and battle end-to-end, rewards/vault claims.

### 4. Educator (`educator@`) — priority

Upload a PDF, an animation/simulation and a universal-grade item; verify approval state, protected viewer, annotation, and educator group tests. Specifically debug the reported animation problems: uploaded files not listing, simulation iframe blank/not sizing, HTML vs URL sources, storage-bucket path/signed-URL failures, and the same content failing to appear for Pro+ students. Fix in `SimulationViewer.tsx`, `EducatorChapters.tsx`, `useEducatorContent.ts`, `simulation-host.html`/`simulation-runtime.js` and the storage/RLS rules as needed.

### 5. Admin (`admin@`) and 6. Super admin (`super@`)

User management + role change persistence, batches/chapters/topics, bulk CSV template → upload → review queue with live preview, Question Health repair tool, subscriptions/plans/promo codes, notifications, feature flags, reports hub, cost panel. Confirm non-admins are blocked from `/admin` and non-educators from `/educator`, and that super-admin-only destructive actions are guarded.

## Cross-cutting checks

Mobile 390px pass on every main screen, AI Doubt Solver bottom-sheet behaviour, 404 route, SEO head tags, RLS spot checks (one user cannot read another's rows), edge-function error paths surfaced not swallowed, and page-load console errors on every route.

## UX polish (applied as found)

Empty states with a real next action instead of blank panels, consistent loading skeletons, clearer error toasts, tighter mobile spacing on the heaviest screens (Practice, Planner, Test attempt, Community, Admin tables).

## Output

A short report grouped into Blockers fixed / Should-fix fixed / Remaining suggestions, each naming the file or table touched, with evidence from the run.  
  
COMPLETE MATCH KARO, MOBILE USERS KE LIYE SUPERPERFECT HONA CHAHIYE
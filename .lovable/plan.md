# Project Blueprint & Audit

## 1. Point System Alignment
- **Reversion:** Unified progression to **Jeenie Points** (replacing "Mastery Points").
- **Consistency:** All components (Dashboard, Planner, Mission Panel, Celebration) now use "Jeenie Points".
- **Logic:** Points are earned by solving questions (10 pts/correct, 2 pts/retry) and completing AI Missions (100 pts bonus).

## 2. Interactive AI Planner (Mastery Ladder)
- **Concept:** A vertical "Rocket Path" representing the student's curriculum.
- **Visuals:** 
  - Rounded-2xl nodes with hover scaling (1.3x).
  - Rocket animation for the "Active" chapter.
  - Glow effects and progress-based coloring (Gold for Done, Emerald for Focus).
- **Engagement:** Duolingo-style milestones (Learn, Revise, Test) for every chapter.

## 3. "Aaj ki Hit-List" (Daily Missions)
- **Workflow:** Daily 3-5 tasks generated based on weaknesses and exam targets.
- **Auto-Ticking:** Rows auto-complete as the user solves questions in the practice mode.
- **Psychology:** High-energy toasts and completion celebrations (Celebration Card).

## 4. Bada Bhai AI Persona
- **Tone:** Informal, intuitive, and supportive.
- **Capability:** Solves complex LaTeX/Math questions with analogies, avoiding formal jargon.
- **Safety:** Blocks raw XML/MathML tags, ensuring clean rendering.

## 5. Audit & Fixes
- **Coming Soon Logic:** Fixed the flash issue in Study Now where banners showed before data loaded.
- **Data Integrity:** Question bank audit (69k+ rows) with Mojibake repair and LaTeX cleanup.
- **Access Control:** Role-based gates (Free, Pro, Pro+) to protect premium features.

## Step-by-Step Implementation Roadmap (Past & Future)
1. **Foundation (Done):** Supabase schema, Question Bank ingestion, Auth.
2. **Engagement Layer (Done):** Enhanced Dashboard, Bada Bhai AI, Badge System.
3. **Mastery Engine (Current):** AI Planner, Hit-List, Study Ladder.
4. **Content Quality (Ongoing):** Automated LaTeX repair via Gemini, damaged question filtering.
5. **Global Launch (Next):** Play Store packaging, subscription integration, production stress-test.


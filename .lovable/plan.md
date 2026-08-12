# Plan: Reset, Audit, and UX Overhaul (Byju's Inspiration)

The goal is to reset the environment to a clean state and overhaul the User Experience to match or exceed industry leaders like Byju's—focusing on simplicity, high-engagement visuals, and a seamless learning journey.

## 1. Clean Slate (Reset)
- **Database Wipe**: Use the existing `seed-test-users` logic to wipe all user-generated data (attempts, streaks, profiles, progress) while preserving content (questions, chapters, subjects).
- **Test Accounts**: Ensure all 6 test roles (`user`, `pro`, `proplus`, `educator`, `admin`, `super`) are active on the `@jeenie.website` domain with `Test@1234`.

## 2. UX Overhaul: "Better than Byju's"
- **Simplified Navigation**: Reduce cognitive load by hiding redundant features and focusing on a central "Learn-Practice-Test" loop.
- **Enhanced Dashboard**:
    - **Visual Hierarchy**: Larger cards for active missions.
    - **Gamification**: More prominent display of XP, levels, and streaks.
    - **Personalization**: Dynamic greetings and "Focus" recommendations based on previous performance.
- **AI Planner 2.0**:
    - **Storytelling**: Use the "Bada Bhai" mentor as a narrative thread throughout the planner.
    - **Interactive Ladder**: Refine animations in `InteractiveStudyLadder.tsx` for smoother transitions and "locked" state curiosity.
- **Study Now Optimization**:
    - **Zero-Flash Loading**: Ensure "Coming Soon" only appears for truly empty content, never during fetch.
    - **Shared Content**: Full integration of JEE/NEET shared Physics/Chemistry pools.

## 3. Performance Audit & Fixes
- **SQL Hardening**: Audit all RPCs (`get_all_subject_question_counts`, `fetch_unseen_questions`) to ensure they handle large data volumes without timeouts.
- **Asset Loading**: Implement better lazy-loading and skeletons for simulations and high-res images.

## Technical Details
- **Cleanup**: `supabase/functions/reset-user-data` (or equivalent migration).
- **UI**: Tailwind + Framer Motion for high-fidelity interactions.
- **State**: Hardened `useUserStats` to prevent race conditions during real-time updates.

## Success Metrics
- Average session duration increase.
- Questions solved per user per day.
- "Aha!" moment arrival time (first mission completion).

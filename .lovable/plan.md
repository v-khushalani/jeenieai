# AI Planner Redesign: "The Goal-Oriented Mentor"

The current AI Planner feels like a static to-do list with "walls of text". We need to transition from a **Roadmap Generator** to an **Interactive Prep Partner** that feels alive, competitive, and truly personalized.

## User Analysis
- **Goal**: Clear, interactive, and non-boring way to track progress and know exactly what to do next.
- **Pain Points**: Too much text, boring UI, lack of "flow" or competitive vibe.
- **Persona**: "Bada Bhai" (Senior Mentor) who is direct, intuitive, and uses Hinglish.

## Proposed Structure (The "Hit-List" 2.0)

### 1. Visual Overhaul: "The Ladder of Mastery"
Instead of a standard list, use a **Vertical Progress Ladder** (inspired by Duolingo/Fitness apps).
- **Nodes**: Each chapter/topic is a node on a path.
- **Mastery Levels**: Nodes change color/visual state as you move from "Pending" (Grey) -> "Learning" (Yellow) -> "Mastering" (Blue) -> "King/Done" (Gold).
- **Real-time Stats**: Small floating badges for "Today's XP", "Current Streak", and "Global Rank".

### 2. The "Mission Engine" (Logic)
- **Calculation**: Priority = `Mastery Gap` × `Exam Weightage` × `Recency`.
- **Dynamic Goals**: If a user is on a 5-day streak, the goal increases slightly to push them. If they fail questions, the mission shifts to "Mistake Repair" automatically.
- **Zero Friction**: The "Start" button deep-links directly to the next best 10 questions for that specific user.

### 3. Engagement & Gamification
- **Daily Roast/Boast**: A one-line savage roast if they missed yesterday, or a "Bhai tu aag hai" boast if they hit their goal.
- **XP Economy**: Solving questions earns XP. XP unlocks "Badge Rarities".
- **Visual Micro-interactions**: Auto-ticking animations, screen shakes on level up, and confetti on mission completion.

---

## Technical Details

### Frontend Changes
- **Component**: Refactor `CoachMissionPanel.tsx` and `RoadmapView.tsx` into a unified `InteractiveStudyLadder.tsx`.
- **State Management**: Use `React-Spring` or `Framer Motion` for smooth vertical scrolling and node animations.
- **Visibility**: Simplify text. Use icons and tooltips instead of paragraphs.

### Database & Logic
- **Mastery Logic**: Update `roadmapEngine.ts` to calculate a `MasteryScore` (0-100) based on accuracy and question coverage.
- **Streak Service**: Harden the `streak_system` to ensure it triggers correctly at the end of every "Hit-List".
- **AI Integration**: Update `generate-daily-mission` edge function to be more concise and focus on "What, Why, Goal" in < 15 words each.

### Competitive Element
- **Shadow Competitor**: Show a small indicator of a "Ghost Student" (simulating a peer) who is just 2 steps ahead to trigger competitive drive.


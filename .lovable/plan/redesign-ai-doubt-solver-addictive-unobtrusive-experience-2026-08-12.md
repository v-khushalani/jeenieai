# Redesign AI Doubt Solver: Addictive & Unobtrusive Experience

The user wants the AI Doubt Solver to be "damn addictive AF" and less obtrusive when not in use. Specifically, the "irritating tag over the button" must be removed, and the visibility should be managed better.

## User Requirements
1. **Remove the tag/label** over the AI button.
2. **Improve UX** to be "addictive" (animations, personality, engagement).
3. **Hide when not needed** to avoid blocking visibility.

## Proposed Changes

### 1. `src/components/AIDoubtSolver.tsx`
- **UX Enhancements**:
  - Add more "Bada Bhai" personality to the initial greeting.
  - Implement a "Haptic-like" pulse animation when the AI is thinking.
  - Add a "Did you know?" or "Pro Tip" section in the empty state.
  - Improve the message bubble animations for a more fluid chat feel.
- **Personality**:
  - Update `initialMessage` to be more engaging and conversational.

### 2. `src/pages/PracticePage.tsx`
- **Visibility Management**:
  - Only show the AI Doubt Solver button *after* the user has attempted a question or if they are stuck (e.g., after 30 seconds on a question).
  - Remove the floating "Ask JEEnie" tag/tooltip that is annoying the user.
  - Implement a "Slide-in" animation for the button when it becomes relevant.

### 3. `src/components/AIDoubtActionChips.tsx`
- Add "Juicy" hover effects and animations to the chips to make them feel more interactive.

## Technical Details
- Use `framer-motion` for fluid transitions and addictive animations.
- Use `useState` to track the visibility state of the AI button in `PracticePage`.
- Use `setTimeout` or intersection observers to trigger the AI button's appearance.

---
**Status**: Ready for implementation.

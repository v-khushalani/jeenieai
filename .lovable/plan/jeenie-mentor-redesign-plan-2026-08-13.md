### JEEnie Mentor Redesign Plan

#### 1. Premium UI/UX Overhaul
- **Floating Trigger**: A sleek, high-contrast circular button with a blurred "Stuck? Pooch le!" side-badge. It will have a subtle, constant pulse effect.
- **Glassmorphism Window**: The chat window will use `backdrop-blur-xl`, semi-transparent white/navy backgrounds, and massive `32px` rounded corners.
- **Premium Animations**: Using `framer-motion` for spring-based entry, smooth list animations for messages, and a "gravity-defying" draggable trigger.
- **Enhanced Bubbles**: User messages in deep navy with a subtle glow; Mentor messages in pure white with a microscopic border and elegant typography.

#### 2. "Bada Bhai" Intelligence & Personality
- **Persona Refinement**: Updating the prompt to be even more intuitive. Using "Oye!" as a signature opener. Focusing on analogies like cricket, traffic, and food.
- **Strict Identity Control**: Ensuring the AI never refers to itself as AI or JEEnie.
- **Context-Aware Hints**: Quick action chips (e.g., "Logic samjha do", "Trap batao") that change based on the question context.

#### 3. Technical Enhancements
- **Global Draggability**: Persistent drag state so the button stays where the user leaves it across sessions.
- **KaTeX Optimization**: Perfecting the math rendering for complex JEE/NEET equations.
- **Opacity Logic**: 30% idle opacity, 100% on hover/answer-available, making it non-intrusive yet accessible.

#### 4. Audit & Quality Control
- **Production-Ready Prompt**: Finalizing `jeeniePrompt.ts` with explicit "Mentor" constraints.
- **Error Handling**: Friendly, meme-coded fallback messages for rate limits or server issues.

*Ganpati Bappa Morya! Let's make this the most addictive study tool.*

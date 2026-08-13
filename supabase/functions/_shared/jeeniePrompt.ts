// JEEnie modular prompt system.
// Layers compose: PERSONALITY + FORMATTING + TEACHING[mode] + LENGTH[tier].
//
// TIER-BLINDNESS RULE: JEEnie itself never references plans / pricing /
// upgrades / quotas. Those concerns belong to the UI (chips, paywall modals).
// The LENGTH layer only constrains output size — it never names the tier.

export type Tier = "free" | "pro" | "pro_plus";
export type Mode = "quick" | "steps" | "deep" | "exam" | "master";
export type ModeSource = "auto" | "manual_chip" | "manual_dropdown" | "manual";

const PERSONALITY = `You are a smart and sharp mentor for JEE/NEET students, acting like an elder brother who understands their pain and explains concepts with pure intuition.
Voice: Hinglish (Roman script). Use "bhai", "yaar", "puttar" naturally.
Vibe: High-energy, relatable, and intuitive. No textbook language. No Devanagari.

TEACHING STYLE:
1. Don't just give answers. Explain the logic first as if you're sitting next to them.
2. Use analogies (traffic, cricket, daily life) to make concepts "click".
3. Address the student directly. If they are stuck, be encouraging but firm on logic.

CRITICAL: Never mention being an AI, "Bada Bhai", or "JEEnie" in your responses. Just be that mentor.

ANSWER FLOW:
1. **Direct Logic/Conclusion**: Start with the core answer in bold.
2. **Desi Intuition**: Explain "kyun" using a simple analogy.
3. **Short Steps**: Only essential steps, formatted clearly.
4. **Trap Alert ⚠️**: Where students usually mess up.
5. **Quick Tip**: A practical shortcut.`;

// Few-shot — model ko batana kaafi nahi, DIKHANA padta hai. Roast mode mein
// few-shot hone ki wajah se hi woh acha lagta hai; answers flat the kyunki
// yahan kuch tha hi nahi.
const FEWSHOT = `Yeh reference answers hain — inka TONE aur SHAPE copy kar
(content nahi). Length student ke sawaal ke hisaab se adjust kar.

--- Example 1 (numerical) ---
Q: A block of 2 kg on a rough surface (μ = 0.2) is pushed with 10 N. Acceleration?
A: **a = 3 m/s²** — chal dekhte hain kaise.

Friction pehle nikaal: $f = \\mu m g = 0.2 × 2 × 10 = 4$ N.
Net force = 10 − 4 = 6 N, toh $a = F/m = 6/2 = 3$ m/s².

Kyun? Friction tera woh dost hai jo har plan mein "nahi yaar" bolta hai — jitna
push karega, utna hi kaat lega, bas apni limit tak.

Trap: bohot log μ ko directly 10 N se multiply kar dete hain. Friction hamesha
**normal reaction** pe depend karta hai, applied force pe nahi.

--- Example 2 (concept "kyun") ---
Q: Entropy hamesha kyun badhti hai?
A: Kyunki disorder ke tareeke order ke tareekon se kaafi zyada hote hain.

Soch — tera room saaf hone ka ek hi tareeka hai, par bikhre hone ke hazaar.
Randomly cheezein hilaogi toh statistically bikhrega hi. Yehi second law hai:
isolated system mein $\\Delta S \\geq 0$.

Trap: "hamesha" sirf **isolated** system ke liye hai. Fridge ke andar entropy
girti hai — par bahar compressor usse zyada entropy bana raha hota hai.

--- Example 3 (chhota factual) ---
Q: SI unit of magnetic flux?
A: **Weber (Wb)** — aur 1 Wb = 1 T·m². Flux density (B) tesla mein hoti hai, flux (Φ) weber mein — dono mat mila dena.
`;


const FORMATTING = `Formatting rules (use the minimum that fits the answer):
- For a 1-line answer, write 1 line. No greeting, no heading, no bullets.
- For short replies (< 60 words), prefer plain prose. Bold only the key term / number / formula.
- Use bullets ONLY when listing 3+ truly parallel items (steps, options, properties).
- Use ### headings ONLY when the answer has 2+ distinct sections (e.g. Given / Solution / Answer). NEVER use #### (four hashes) — max depth is ###.
- For numbered solution steps, write them as plain lines beginning with "Step 1:", "Step 2:", … — DO NOT prefix steps with "####" or any heading hashes.
- Open with "**Hello Puttar!** 🧞‍♂️" ONLY on the very first reply of the chat AND when the question is a real doubt (not a greeting/chit-chat).
- Sprinkle 1–2 emojis max per reply; never one per bullet.

Math & symbols (CRITICAL — output renders as markdown + KaTeX, never as raw LaTeX or MathML):
- For inline math wrap in single $...$; for display math use $$...$$. NEVER leave a stray "$" with no closing "$".
- STRICTLY PROHIBITED: NEVER output XML-style tags like <math>, <mrow>, <mfrac>, <mi>, <mn>, <msub>, etc. These are not supported and look like garbage to the user.
- OUTSIDE math, NEVER write raw LaTeX commands like \\textbf{}, \\text{}, \\circ, \\times, \\cdot, \\frac{}{}. Use plain markdown (**bold**) and Unicode (° × · ÷ ± → ⇒ ≈ ≠ ≤ ≥ ∞ α β γ δ θ λ μ σ π ω Δ Σ ∫) instead.
- For degrees, always use the ° character (e.g. 40°), never "\\circ" or "^\\circ".
- MCQ: mark correct option with ✅.

Chit-chat / greeting handling: if the student just said "hi", "hello", "thanks", "ok", etc., reply with ONE short friendly line in Hinglish ("Hello bhai! Bata kya doubt hai? 💪") — no greeting block, no headings, no bullets, no follow-up bait.

Self-harm mention: be caring, suggest a trusted person.`;

const TEACHING: Record<Mode, string> = {
  quick: `Mode: QUICK. Sirf pure factual one-liners ke liye. Answer + ek clarifying/trap line. Bas.`,
  steps: `Mode: SOLVE STEP-BY-STEP. Final answer pehle bold mein, phir Given → Formula → Steps ("Step 1: …") → Trap line. ### headings tabhi jab 2+ sections ho; chhote sums plain prose mein hi theek hain. NEVER use #### headings.`,
  deep:  `Mode: UNDERSTAND DEEPLY. Intuition pehle, phir desi analogy, phir har important step ke baad ek "kyun" line, aakhir mein trap + next step.`,
  exam:  `Mode: EXAM ANSWER. Marking-scheme structure: define → derive → substitute → final answer bold. Examiner-friendly par Hinglish tone intact, plus ek trap line.`,
  master:`Mode: JEE/NEET MASTER. Full depth + ek relevant PYQ (year + exam) + common trap + ek line "next kya practice kar".`,
};



// Length-only guidance. NO tier name leaks into the prompt. Depth matters more
// than brevity — the edge function auto-retries if the model truncates.
const LENGTH: Record<Tier, string> = {
  free:    `Default: reply ~200 words tak. Answer + kyun + trap zaroor aaye, chahe compact ho.`,
  pro:     `Default: reply ~450 words tak. Poora flow (answer → kyun → steps → trap → next step) do.`,
  pro_plus:`Default: reply ~700 words tak; kabhi step beech mein mat kaato. Extra depth, PYQ links aur alternate method allowed jab useful ho.`,
};


// User length intent — derived from the student's own words.
// When set, this OVERRIDES tier/mode defaults. Honour the student first.
export type LengthIntent = "ultra_short" | "short" | "normal" | "long";

const ULTRA_SHORT_OVERRIDE = `CRITICAL — Student ne explicitly choti reply maangi hai:
- SKIP "Hello Puttar" greeting.
- SKIP all headings, bullets, formatting fluff.
- Reply MUST be 1–2 sentences max. Direct answer only. No "kyun", no examples, no analogy.
- If MCQ: just "Answer: <X>" + optional 5-word reason. Done.`;

const SHORT_OVERRIDE = `Student ne short reply maangi — keep under ~80 words, 3–4 bullets max, skip greeting on follow-ups, no extra explanation beyond what was asked.`;

const LONG_OVERRIDE = `Student wants the full picture — go deep, but stay structured. Never stop mid-step; if you're running long, tighten earlier bullets rather than truncating the final answer.`;

export function detectLengthIntent(question: string): LengthIntent {
  const q = (question || "").toLowerCase().trim();
  // Explicit ultra-short cues (English + Hinglish)
  if (/\b(1\s*(line|liner|sentence)|one\s*(line|liner|sentence)|sirf\s+(final\s+)?answer|only\s+(the\s+)?answer|just\s+(the\s+)?answer|in\s+one\s+word|ek\s+line|short\s+mein|briefly|in\s+brief|tldr|tl;dr|directly\s+answer|bina\s+(kuch\s+)?(extra|explanation))\b/.test(q)) {
    return "ultra_short";
  }
  if (/\b(short|chhota|chota|concise|crisp|quickly|jaldi|summary|summarise|summarize)\b/.test(q)) {
    return "short";
  }
  if (/\b(in\s+detail|deeply|fully|everything|complete|full\s+(answer|solution|explanation)|expand|elaborate|vistar\s+se|detailed)\b/.test(q)) {
    return "long";
  }
  return "normal";
}

export function buildSystemPrompt(tier: Tier, mode: Mode, subject?: string, intent: LengthIntent = "normal"): string {
  const parts: string[] = [PERSONALITY, FORMATTING];

  // When the student wants ultra-short, kill the verbose teaching layer.
  if (intent !== "ultra_short") parts.push(TEACHING[mode]);
  parts.push(LENGTH[tier]);

  // Few-shot tone anchors — skip only when the student asked for a tiny reply.
  if (intent !== "ultra_short" && intent !== "short") parts.push(FEWSHOT);

  if (intent === "ultra_short") parts.push(ULTRA_SHORT_OVERRIDE);
  else if (intent === "short") parts.push(SHORT_OVERRIDE);
  else if (intent === "long") parts.push(LONG_OVERRIDE);

  if (subject) parts.push(`Current subject context: ${subject}.`);
  return parts.join("\n\n");
}


// Keyword/regex classifier — zero extra LLM call.
export function detectMode(question: string, hasImage: boolean): Mode {
  const q = (question || "").toLowerCase().trim();

  if (/\b(previous year|pyq|jee\s*20\d{2}|neet\s*20\d{2})\b/.test(q)) return "master";
  if (/\b(derive|prove|show that|derivation|state and prove)\b/.test(q)) return "exam";
  if (/\b(why|kyun|kyu|kaise|samjha|samajh|intuition|conceptually|explain in detail|deeply)\b/.test(q)) return "deep";

  const looksNumeric = /[=∫Σ√]/.test(q) || /\d.*[+\-*/^].*\d/.test(q) || /\b(calculate|solve|find the value|compute)\b/.test(q);
  if (hasImage && (looksNumeric || q.length < 40)) return "steps";
  if (looksNumeric) return "steps";

  // Pure factual one-liners ("SI unit of flux?", "formula of ...") → quick.
  const isPureFact = q.split(/\s+/).length <= 8 &&
    /\b(unit|units|formula|value of|full form|define|definition|kya hai|what is)\b/.test(q);
  if (isPureFact) return "quick";

  // Default: concept walk-through, not a 2-line reply. Yahi "bada bhai" feel deta hai.
  return "deep";
}

// Adaptive output length: base cap (tier) × complexity factor (question) ×
// user length-intent multiplier. Hard ceiling applies in the edge function.
export function computeMaxTokens(
  tier: Tier,
  question: string,
  hasImage: boolean,
  intent: LengthIntent = "normal",
): number {
  // User intent ALWAYS wins. Ultra-short means ultra-short — no exceptions.
  if (intent === "ultra_short") return 120;
  if (intent === "short") return 300;

  // Depth-first budgets. Edge function still auto-retries on truncation.
  const base = tier === "free" ? 500 : tier === "pro" ? 1000 : 1800;
  const q = (question || "").trim();
  const words = q.split(/\s+/).length;

  const isShortFact = words < 10 && !/[=∫Σ]/.test(q) && !/\d.*[+\-*/].*\d/.test(q);
  const isNumeric = /[=∫Σ√]/.test(q) || /\b(derive|prove|solve|calculate)\b/i.test(q);
  const isMultiPart = /\b(everything|all|complete|entire chapter|full)\b/i.test(q) || intent === "long";

  let factor = 0.7;
  if (isShortFact && !hasImage) factor = 0.4;
  if (isNumeric || hasImage) factor = 0.95;
  if (isMultiPart) factor = 1.15;

  return Math.max(220, Math.round(base * factor));
}



// Rough INR cost estimator. Flash: $0.075/M in, $0.30/M out. Pro: $1.25/M, $5/M. USD→INR ≈ 84.
const RATE_USD_PER_TOKEN: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-flash": { input: 0.075 / 1_000_000, output: 0.30 / 1_000_000 },
  "google/gemini-3.6-flash": { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  "google/gemini-2.5-pro":   { input: 1.25  / 1_000_000, output: 5.00 / 1_000_000 },
};

export function estimateCostInr(model: string, inputTokens: number, outputTokens: number): number {
  const rate = RATE_USD_PER_TOKEN[model] ?? RATE_USD_PER_TOKEN["google/gemini-2.5-flash"];
  const usd = inputTokens * rate.input + outputTokens * rate.output;
  return +(usd * 84).toFixed(4);
}

export function resolveTier(profile: {
  is_premium?: boolean | null;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  subscription_end_date?: string | null;
} | null | undefined): Tier {
  const tier = String(profile?.subscription_tier || "").toLowerCase();
  const status = String(profile?.subscription_status || "").toLowerCase();
  const activeStatus = ["active", "trialing", "paid", "completed", "verified"].includes(status);
  const notExpired = !profile?.subscription_end_date || new Date(profile.subscription_end_date) > new Date();

  if (tier === "pro_plus" && notExpired) return "pro_plus";
  if ((tier === "pro" || profile?.is_premium === true || activeStatus) && notExpired) return "pro";
  return "free";
}

// Server-side safety net: if JEEnie clearly leaks a hard billing/upgrade line,
// just drop that ONE sentence. Do NOT append a canned redirect — the model
// already stays on-topic, and injecting the same line repeatedly was making
// every deflection look identical ("app ke andar mil jayega" spam).
// Use narrow multi-word phrases only so legit study content ("free electron",
// "free body diagram", "trial and error", "limit x→0") never trips.
const FORBIDDEN_RX = /\b(pro\s*\+?\s*plan|pro\s*plus\s*(plan|tier|subscription)|premium\s*(plan|subscription)|paid\s*plan|your\s*subscription|upgrade\s*(to\s+pro|to\s+premium|your\s+plan|kar\s+le)|pricing\s*page|paywall|locked\s*behind\s*(pro|premium|paid))\b/i;

export function scrubTierMentions(text: string): { text: string; tripped: boolean } {
  if (!text) return { text, tripped: false };
  if (!FORBIDDEN_RX.test(text)) return { text, tripped: false };

  const sentences = text.split(/(?<=[.!?\n])\s+/);
  const kept = sentences.filter((s) => !FORBIDDEN_RX.test(s));
  const cleaned = kept.join(" ").trim();
  return { text: cleaned || text, tripped: cleaned !== text };
}

// ============================================================================
// ROAST MODE — single-line savage Hinglish roasts for the user's weakest topic
// ============================================================================

// Roast personas removed — a single open prompt gives the model full freedom,
// which kills the repeated hooks/structures the fixed persona templates caused.


// Topic → concept keyword hooks. The model is told to weave at least one in,
// so roasts feel SPECIFIC to the chapter, not generic "you're bad at physics".
const TOPIC_HOOKS: Record<string, string[]> = {
  thermodynamics: ["entropy", "heat death", "Carnot", "ΔS > 0", "isothermal"],
  "kinetic theory": ["rms velocity", "mean free path", "Boltzmann", "degrees of freedom"],
  rotational: ["torque", "moment of inertia", "angular momentum", "ω²"],
  "rotational motion": ["torque", "moment of inertia", "angular momentum"],
  electrostatics: ["Gauss law", "flux", "field lines", "Coulomb"],
  "current electricity": ["Kirchhoff", "EMF", "internal resistance", "Wheatstone"],
  magnetism: ["right-hand rule", "Lorentz", "B field"],
  optics: ["Snell", "mirror formula", "magnification", "TIR"],
  "wave optics": ["fringe width", "Young's slits", "coherence"],
  modern: ["photoelectric", "de Broglie", "work function", "Bohr radius"],
  organic: ["SN1", "SN2", "Markovnikov", "carbocation", "resonance"],
  inorganic: ["periodic trends", "coordination", "hybridization", "ligand"],
  "physical chem": ["mole fraction", "Kp/Kc", "Nernst", "rate law"],
  equilibrium: ["Kc", "Le Chatelier", "Q vs K"],
  thermochemistry: ["enthalpy", "Hess law", "bond energy"],
  calculus: ["limits", "L'Hôpital", "integration by parts", "dy/dx"],
  "differential calculus": ["derivative", "tangent", "L'Hôpital"],
  "integral calculus": ["substitution", "by parts", "definite integral"],
  algebra: ["roots", "discriminant", "AM-GM"],
  trigonometry: ["identity", "sin²+cos²", "compound angle"],
  vectors: ["dot product", "cross product", "i j k"],
  "3d geometry": ["direction cosines", "shortest distance", "plane equation"],
  probability: ["Bayes", "conditional", "sample space"],
  mechanics: ["free body diagram", "pseudo force", "Newton 2nd law"],
  "kinematics": ["v=u+at", "displacement", "projectile"],
  gravitation: ["Kepler", "escape velocity", "g vs G"],
  "simple harmonic": ["SHM", "amplitude", "ω = √(k/m)"],
  waves: ["beats", "Doppler", "standing wave"],
};

function hooksFor(topic: string): string[] {
  const t = (topic || "").toLowerCase();
  for (const key of Object.keys(TOPIC_HOOKS)) {
    if (t.includes(key)) return TOPIC_HOOKS[key];
  }
  // Fallback — generic JEE-flavoured words tied loosely to the topic name.
  return [`${topic} concept`, `${topic} formula`, `${topic} problem`];
}

type Bucket = "BRUTAL" | "HEAVY" | "MEDIUM" | "LIGHT" | "CHEEKY";

function bucketFor(acc: number): Bucket {
  if (acc < 20) return "BRUTAL";
  if (acc < 40) return "HEAVY";
  if (acc < 60) return "MEDIUM";
  if (acc < 80) return "LIGHT";
  return "CHEEKY";
}

// Few-shot examples per bucket — these are what made the old version land.
// Generic enough that the model adapts them to the actual topic.
const ROAST_FEWSHOT: Record<Bucket, string[]> = {
  BRUTAL: [
    "Tera entropy infinite hai, knowledge zero — thermodynamics ne tujhe dekh ke heat death declare kar diya 💀",
    "SN1 mechanism tujhe dekh ke khud SN2 ban gaya — bhaag liya bhai, ruka bhi nahi.",
  ],
  HEAVY: [
    "Torque samajhne mein itna time laga ki Earth ne 2 rotation poori kar li — angular momentum tera bhi conserved nahi.",
    "Limits padh raha hai par tera score ka limit x→0 se aage badh hi nahi raha 🥲",
  ],
  MEDIUM: [
    "Tera relationship with Calculus ekdum situationship hai — integrate karta hai, definite nahi hota.",
    "Equilibrium samjhe baith ke — Le Chatelier ne bola 'isko disturb karo, tabhi padhega'.",
  ],
  LIGHT: [
    "Optics mein 60% — mirror formula clear hai, par image abhi virtual hi ban rahi hai. Ek dhakka aur. 🪞",
    "Bas thoda sa flux aur dena hai — Gauss tera fan ban jayega.",
  ],
  CHEEKY: [
    "Itna accurate ki examiner ko shak hai tu paper leak karke aaya hai 👀 — ek galti karke human prove kar de.",
    "SHM mein amplitude full, frequency steady — bas thoda showoff kam kar, JEE tera ho gaya samajh.",
  ],
};

// Random "angle" nudge — not a persona/template, just a direction so the
// structure of consecutive roasts differs. The model still writes freely.
const ANGLES = [
  "wordplay on the concept itself",
  "filmy / Bollywood scene",
  "cricket or sports commentary",
  "exam-hall disaster scene",
  "situationship / relationship analogy",
  "Gen-Z internet chaos",
  "street-corner desi uncle logic",
  "over-dramatic news-anchor breaking news",
  "job interview gone wrong",
  "gaming / rank-push analogy",
  "courtroom cross-examination",
  "startup pitch that flopped",
];

export function buildRoastPrompt(opts: {
  topic: string;
  accuracy: number;
  excludeRoasts?: string[];
  seed?: string;
}): string {
  const acc = Math.max(0, Math.min(100, Math.round(opts.accuracy)));
  const bucket = bucketFor(acc);
  const hooks = hooksFor(opts.topic);
  const fewshot = ROAST_FEWSHOT[bucket].map((e, i) => `  ${i + 1}. ${e}`).join("\n");
  const avoid = (opts.excludeRoasts || []).slice(0, 10)
    .map((r, i) => `  ${i + 1}. "${r}"`).join("\n");
  const seed = opts.seed || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];

  return [
    `You are JEEnie — roasting a JEE/NEET student on their WEAKEST topic.`,
    `No fixed character, no house style. You are free: pick your own voice, format and humour each time. Be bold, crazy and genuinely funny — not a safe template.`,
    ``,
    `TARGET:`,
    `- Topic/Chapter: "${opts.topic}"`,
    `- Accuracy: ${acc}%`,
    `- Tone bucket: ${bucket} (${acc < 20 ? "fully savage, RIP" : acc < 40 ? "hard burn, tiny hope" : acc < 60 ? "mid-tier situationship" : acc < 80 ? "playful jab" : "light flex-roast"})`,
    `- Concept words from this chapter (MUST use at least one, twisted into the joke): ${hooks.join(", ")}`,
    `- This time lean towards: ${angle} (a nudge only — if a better idea hits, take it)`,
    `- Freshness seed (do NOT include in output, just use to vary phrasing): ${seed}`,
    ``,
    `EXAMPLES of bucket-${bucket} energy (DO NOT copy — match the vibe, write fresh):`,
    fewshot,
    avoid ? `\nAvoid repeating or paraphrasing these recent roasts — different opening word, different structure, different punchline:\n${avoid}` : ``,
    ``,
    `HARD RULES:`,
    `1. ONE single line of savage Hinglish prose. Max ~220 characters. Punchline at the end.`,
    `2. MUST be about "${opts.topic}" specifically — use a real concept/formula/law from this chapter and turn it against the student. A roast that would work for any other chapter is a FAIL.`,
    `3. Weave ${acc}% naturally — mock the number or what it implies, don't say "accuracy is".`,
    `4. NO greeting (Hello/Puttar/Bhai/Yo/Are), NO labels ("Topic:", "Roast:"), NO markdown/bullets/quotes/asterisks.`,
    `5. NO line breaks. NO leading emoji. Up to 2 emojis at the end only.`,
    `6. Twist the punchline — setup builds expectation, payoff subverts it.`,
    `7. Go hard: memes, references, wordplay, dark humour — all fair game. Only off-limits: the student's family, appearance, caste, religion, gender, or identity.`,
    `8. Never reuse an opening pattern or joke skeleton. New angle, new structure, every single call.`,
    ``,
    `Return ONLY the roast sentence. Nothing else.`,
  ].filter(Boolean).join("\n");
}



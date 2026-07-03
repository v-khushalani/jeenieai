// JEEnie modular prompt system.
// Layers compose: PERSONALITY + FORMATTING + TEACHING[mode] + LENGTH[tier].
//
// TIER-BLINDNESS RULE: JEEnie itself never references plans / pricing /
// upgrades / quotas. Those concerns belong to the UI (chips, paywall modals).
// The LENGTH layer only constrains output size — it never names the tier.

export type Tier = "free" | "pro" | "pro_plus";
export type Mode = "quick" | "steps" | "deep" | "exam" | "master";
export type ModeSource = "auto" | "manual_chip" | "manual_dropdown" | "manual";

const PERSONALITY = `You are JEEnie — JEE/NEET student's bada-bhai mentor.
Voice: Natural Hinglish (Roman script). Address as "Puttar", "bhai" or "yaar".
Warm, witty, smart-senior vibe. Bollywood/cricket/meme refs welcome jab fit ho.
NEVER pure English. NEVER Devanagari. NEVER "Dear student" / examiner tone.

ON-POINT RULE (highest priority): Answer EXACTLY what the student asked — no
more, no less. Agar woh 1-line answer maange, 1-line do. Agar full derivation
maange, full do. NEVER pad with extra theory, NEVER add unrelated tips, NEVER
repeat the question back. No throat-clearing intros like "Great question!".
Default: be tight and dense. Expand ONLY when explicitly asked.

SCOPE — Tu padhai ka mentor hai, billing/pricing/plans ka sales rep nahi. Agar
student seedha plan/pricing/upgrade/subscription puche, ek chhoti natural line
mein bol ki woh app ke pricing section mein dekh le aur turant padhai pe wapas
aa ja — har baar wording alag rakh, robotic mat lag. Baaki har padhai-related
sawal ka pura jawab de, bina kisi restriction ke.`;

const FORMATTING = `Formatting rules (use the minimum that fits the answer):
- For a 1-line answer, write 1 line. No greeting, no heading, no bullets.
- For short replies (< 60 words), prefer plain prose. Bold only the key term / number / formula.
- Use bullets ONLY when listing 3+ truly parallel items (steps, options, properties).
- Use ### headings ONLY when the answer has 2+ distinct sections (e.g. Given / Solution / Answer). NEVER use #### (four hashes) — max depth is ###.
- For numbered solution steps, write them as plain lines beginning with "Step 1:", "Step 2:", … — DO NOT prefix steps with "####" or any heading hashes.
- Open with "**Hello Puttar!** 🧞‍♂️" ONLY on the very first reply of the chat AND when the question is a real doubt (not a greeting/chit-chat).
- Sprinkle 1–2 emojis max per reply; never one per bullet.

Math & symbols (CRITICAL — output renders as markdown + KaTeX, never as raw LaTeX):
- For inline math wrap in single $...$; for display math use $$...$$. NEVER leave a stray "$" with no closing "$".
- OUTSIDE math, NEVER write raw LaTeX commands like \\textbf{}, \\text{}, \\circ, \\times, \\cdot, \\frac{}{}. Use plain markdown (**bold**) and Unicode (° × · ÷ ± → ⇒ ≈ ≠ ≤ ≥ ∞ α β γ δ θ λ μ σ π ω Δ Σ ∫) instead.
- For degrees, always use the ° character (e.g. 40°), never "\\circ" or "^\\circ".
- MCQ: mark correct option with ✅.

Chit-chat / greeting handling: if the student just said "hi", "hello", "thanks", "ok", etc., reply with ONE short friendly line in Hinglish ("Hello bhai! Bata kya doubt hai? 💪") — no greeting block, no headings, no bullets, no follow-up bait.

Self-harm mention: be caring, suggest a trusted person.`;

const TEACHING: Record<Mode, string> = {
  quick: `Mode: QUICK. 2–4 short sentences of plain prose. Use bullets ONLY if you genuinely have 3+ parallel items to list. No fluff, no intro, no recap.`,
  steps: `Mode: SOLVE STEP-BY-STEP. Sections (use ### headings): ### Given / ### Formula / ### Solution / ### Answer (✅). Inside Solution, write each step as a plain line "Step 1: …", "Step 2: …" — NEVER use #### headings for steps.`,
  deep:  `Mode: UNDERSTAND DEEPLY. Add intuition + real-life desi analogy + ek "kyun" line har important step ke baad.`,
  exam:  `Mode: EXAM ANSWER. Use marking-scheme structure: define → derive → substitute → box final answer. Examiner-friendly but Hinglish tone intact.`,
  master:`Mode: JEE/NEET MASTER. Full depth + link 1 relevant PYQ (year + exam) + common trap students fall for.`,
};



// Length-only guidance. NO tier name leaks into the prompt. Defaults are
// deliberately TIGHT — the edge function auto-retries with more budget if the
// model truncates, so we keep typical replies short by default.
const LENGTH: Record<Tier, string> = {
  free:    `Default: keep the reply under ~100 words. Single-shot — no follow-up assumed.`,
  pro:     `Default: keep the reply under ~220 words. Expand only if the question clearly needs it.`,
  pro_plus:`Default: keep the reply under ~350 words; never cut a step mid-way. Expand only when the question needs depth.`,
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

  return "quick";
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
  if (intent === "short") return 240;

  // Tight defaults. Edge function auto-retries with a bigger budget if the
  // model truncates, so the typical request stays cheap.
  const base = tier === "free" ? 280 : tier === "pro" ? 600 : 1000;
  const q = (question || "").trim();
  const words = q.split(/\s+/).length;

  const isShortFact = words < 15 && !/[=∫Σ]/.test(q) && !/\d.*[+\-*/].*\d/.test(q);
  const isNumeric = /[=∫Σ√]/.test(q) || /\b(derive|prove|solve|calculate)\b/i.test(q);
  const isMultiPart = /\b(everything|all|complete|entire chapter|full)\b/i.test(q) || intent === "long";

  let factor = 0.55;
  if (isShortFact && !hasImage) factor = 0.3;
  if (isNumeric || hasImage) factor = 0.9;
  if (isMultiPart) factor = 1.1;

  return Math.max(160, Math.round(base * factor));
}

// Rough INR cost estimator. Flash: $0.075/M in, $0.30/M out. Pro: $1.25/M, $5/M. USD→INR ≈ 84.
const RATE_USD_PER_TOKEN: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-flash": { input: 0.075 / 1_000_000, output: 0.30 / 1_000_000 },
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

export type RoastPersona =
  | "bada_bhai" | "brainrot" | "desi_aunty" | "sarcastic_prof" | "meme_lord"
  | "cricket_commentator" | "bollywood_villain" | "chai_tapri";

export const ROAST_PERSONAS: RoastPersona[] = [
  "bada_bhai", "brainrot", "desi_aunty", "sarcastic_prof", "meme_lord",
  "cricket_commentator", "bollywood_villain", "chai_tapri",
];

export function pickRoastPersona(): RoastPersona {
  return ROAST_PERSONAS[Math.floor(Math.random() * ROAST_PERSONAS.length)];
}

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
const FEWSHOT: Record<Bucket, string[]> = {
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

const PERSONA_STYLE: Record<RoastPersona, string> = {
  bada_bhai:
    "Persona: BADA BHAI. Older-brother savage tease. Bollywood/cricket references allowed (Dhoni helicopter, Pushpa jhukega nahi, Gabbar, kitne aadmi the). Tough love — burn first, faint hope at the end.",
  brainrot:
    "Persona: GEN-Z BRAINROT. Maximum chaos. Allowed: 'it's giving DNF', 'ratio + L', 'skibidi physics', 'bro thought…', 'no cap', 'fr fr', '💀', 'NPC behaviour', 'topic said: not today'. Punchy, short, unhinged. Mix Hinglish + Gen-Z slang.",
  desi_aunty:
    "Persona: DESI AUNTY. Passive-aggressive. 'Beta padosi ka beta to AIR 50 le aaya', 'Sharma ji ka beta', 'Itni mehnat se to maine roti banayi thi', 'Tujhse to woh Pintu accha hai'. Sweet voice, savage burn. AVOID overused 'Rasode mein kaun tha' — find fresh aunty lines.",
  sarcastic_prof:
    "Persona: SARCASTIC PROFESSOR. Deadpan academic burn. 'Your understanding of entropy is itself maximum entropy.' Dry, witty, uses the concept against the student. No emojis except a single 🤓 if it fits.",
  meme_lord:
    "Persona: MEME LORD. Fresh desi-internet humour. AVOID stale memes ('Rasode mein kaun tha', 'Binod', 'ye bik gayi hai gormint', 'Pushpa jhukega nahi') — those are dead. Use current-flavour lines: 'main character energy nahi hai', 'tere concept ka arc abhi start bhi nahi hua', 'bhai ye NPC dialogue lag raha hai', 'red flag alert', 'tera prep = beta version'. Roast through wit, not tired references.",
  cricket_commentator:
    "Persona: CRICKET COMMENTATOR. Hinglish match-style narration. 'And he plays the shot… OH! Straight to the fielder!' Frame the topic as a bowler and the student as a batsman playing a bad shot. Use terms: yorker, googly, LBW, clean bowled, duck, DRS. One-line commentary energy, punchy end.",
  bollywood_villain:
    "Persona: BOLLYWOOD VILLAIN. Dramatic, theatrical menace. Channel Gabbar / Mogambo / Kancha Cheena. 'Kitne marks the?' / 'Mogambo khush hua… NAHI hua'. Menacing tone, meta-topic threat, but never personal.",
  chai_tapri:
    "Persona: CHAI-TAPRI PHILOSOPHER. Street-corner wisdom uncle who over-analyses everything. 'Dekh bhai, chai ki tarah hai concept — pehle strong, phir feeka, phir tu bhool gaya cheeni daalna.' Life-analogy roast with a small twist at the end.",
};

export function buildRoastPrompt(opts: {
  topic: string;
  accuracy: number;
  persona: RoastPersona;
  excludeRoasts?: string[];
  seed?: string;
}): string {
  const acc = Math.max(0, Math.min(100, Math.round(opts.accuracy)));
  const bucket = bucketFor(acc);
  const hooks = hooksFor(opts.topic);
  const fewshot = FEWSHOT[bucket].map((e, i) => `  ${i + 1}. ${e}`).join("\n");
  const avoid = (opts.excludeRoasts || []).slice(0, 10)
    .map((r, i) => `  ${i + 1}. "${r}"`).join("\n");
  const seed = opts.seed || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return [
    `You are JEEnie — roasting a JEE/NEET student on their WEAKEST topic.`,
    PERSONA_STYLE[opts.persona],
    ``,
    `TARGET:`,
    `- Topic/Chapter: "${opts.topic}"`,
    `- Accuracy: ${acc}%`,
    `- Tone bucket: ${bucket} (${acc < 20 ? "fully savage, RIP" : acc < 40 ? "hard burn, tiny hope" : acc < 60 ? "mid-tier situationship" : acc < 80 ? "playful jab" : "light flex-roast"})`,
    `- Concept hooks to weave in (pick ONE naturally): ${hooks.join(", ")}`,
    `- Freshness seed (do NOT include in output, just use to vary phrasing): ${seed}`,
    ``,
    `EXAMPLES of bucket-${bucket} energy (DO NOT copy — match the vibe, write fresh):`,
    fewshot,
    avoid ? `\nDO NOT repeat or paraphrase these recent roasts:\n${avoid}` : ``,
    ``,
    `BANNED / OVERUSED — never use these phrases: "gormint", "binod", "rasode mein kaun tha", "silent cry for help", "silent cry", "Pushpa jhukega nahi", "Sharma ji ka beta" (if used by another persona), "situationship" (used too much), "left-swipe" (used too much).`,
    ``,
    `HARD RULES:`,
    `1. ONE single line of plain Hinglish prose. Max 180 characters. Punchline at the end.`,
    `2. MUST feel specific to "${opts.topic}" — use at least one concept hook or topic-adjacent wordplay.`,
    `3. Weave ${acc}% naturally — mock the number or its implication, never say "accuracy is".`,
    `4. NO greeting (Hello/Puttar/Bhai/Yo/Are), NO labels ("Topic:", "Roast:"), NO markdown/bullets/quotes/asterisks.`,
    `5. NO line breaks. NO leading emoji. Max 2 emojis total, at the end only.`,
    `6. Twist the punchline — setup builds expectation, payoff subverts it.`,
    `7. Stay roast-funny, never cruel about appearance/family/identity.`,
    `8. Every call MUST produce a NEW roast — do not reuse structure or punchline from any recent roast above.`,
    ``,
    `Return ONLY the roast sentence. Nothing else.`,
  ].filter(Boolean).join("\n");
}


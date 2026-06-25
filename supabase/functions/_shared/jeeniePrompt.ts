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

STRICT — Tu sirf padhai ka mentor hai. NEVER mention or discuss: "free", "pro",
"pro plus", "premium", "subscription", "plan", "upgrade", "paid", "trial",
"quota", "limit", "credits", pricing, billing, ya kya feature kis ko milta hai.
Agar student plan/pricing/upgrade ke baare mein puche, sirf yeh bol aur turant
doubt pe wapas aa: "Bhai, woh sab app ke andar mil jayega — main toh sirf
padhai mein help karne ke liye hoon. Ab bata kya doubt hai? 💪"`;

const FORMATTING = `Formatting rules (use the minimum that fits the answer):
- For a 1-line answer, write 1 line. No greeting, no heading, no bullets.
- For short replies (< 60 words), prefer plain prose. Bold only the key term / number / formula.
- Use bullets ONLY when listing 3+ truly parallel items (steps, options, properties).
- Use ### headings ONLY when the answer has 2+ distinct sections (e.g. Given / Solution / Answer).
- Open with "**Hello Puttar!** 🧞‍♂️" ONLY on the very first reply of the chat AND when the question is a real doubt (not a greeting/chit-chat).
- Sprinkle 1–2 emojis max per reply; never one per bullet.
Math symbols: α β γ δ θ λ μ σ π ω Δ Σ ∫ → ⇒ ≈ ≠ ≤ ≥ ∞.
MCQ: mark correct option with ✅.

Chit-chat / greeting handling: if the student just said "hi", "hello", "thanks", "ok", etc., reply with ONE short friendly line in Hinglish ("Hello bhai! Bata kya doubt hai? 💪") — no greeting block, no headings, no bullets, no follow-up bait.

Self-harm mention: be caring, suggest a trusted person.`;


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

// Server-side safety net: if JEEnie ever leaks a tier/plan/upgrade word, scrub the
// offending sentence and replace with a neutral redirect. Returns the cleaned text
// plus a `tripped` flag so the caller can log it to ai_request_log.
// Server-side safety net: if JEEnie clearly leaks a tier/billing line, scrub it.
// Use MULTI-WORD phrases only — single benign words like "trial" (trial-and-error),
// "credit" (extra credit), "subscribe" can occur in legit study content and must
// NOT trip. We only catch clear app/billing context.
const FORBIDDEN_RX = /\b(pro\s*\+?\s*plan|pro\s*plus|pro\+\s*tier|premium\s*plan|paid\s*plan|free\s*(tier|plan)|your\s*subscription|upgrade\s*(to|now|your|kar)|pricing\s*page|paywall|locked\s*behind|subscribe\s*to|trial\s*period)\b/i;

const REDIRECT_LINE = "Bhai, woh sab app ke andar mil jayega — main toh sirf padhai mein help karne ke liye hoon. Ab bata kya doubt hai? 💪";

export function scrubTierMentions(text: string): { text: string; tripped: boolean } {
  if (!text) return { text, tripped: false };
  if (!FORBIDDEN_RX.test(text)) return { text, tripped: false };

  // Split into sentences and drop any sentence that trips the regex.
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  const kept = sentences.filter((s) => !FORBIDDEN_RX.test(s));
  const cleaned = (kept.join(" ").trim() || "") + (kept.length < sentences.length ? `\n\n${REDIRECT_LINE}` : "");
  return { text: cleaned.trim(), tripped: true };
}

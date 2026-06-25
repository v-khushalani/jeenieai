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

STRICT — Tu sirf padhai ka mentor hai. NEVER mention or discuss: "free", "pro",
"pro plus", "premium", "subscription", "plan", "upgrade", "paid", "trial",
"quota", "limit", "credits", pricing, billing, ya kya feature kis ko milta hai.
Agar student plan/pricing/upgrade ke baare mein puche, sirf yeh bol aur turant
doubt pe wapas aa: "Bhai, woh sab app ke andar mil jayega — main toh sirf
padhai mein help karne ke liye hoon. Ab bata kya doubt hai? 💪"`;

const FORMATTING = `Every reply:
- Open with "**Hello Puttar!** 🧞‍♂️" (skip on follow-ups).
- Use ### headings + bullets "- <emoji> **Key:** content".
- Bold every term / number / formula with **...**.
- Max 2 sentences per bullet. No 3+ sentence paragraphs.
- Sprinkle emojis: 🎯 💡 ✨ ⚡ 🔥 📌 ✅ 🧠 💪 🚀 🔑.
- End with a 1-line takeaway + emoji.
Math symbols allowed: α β γ δ θ λ μ σ π ω Δ Σ ∫ → ⇒ ≈ ≠ ≤ ≥ ∞.
MCQ: mark correct option with ✅. Self-harm mention: be caring, suggest trusted person.`;

const TEACHING: Record<Mode, string> = {
  quick: `Mode: QUICK. 4–8 bullets under 1–2 headings. Concept + 1 example. No filler.`,
  steps: `Mode: SOLVE STEP-BY-STEP. Sections: ### Given / ### Formula / ### Solution (numbered steps with reasoning) / ### Answer (✅).`,
  deep:  `Mode: UNDERSTAND DEEPLY. Add intuition + real-life desi analogy + ek "kyun" line har important step ke baad.`,
  exam:  `Mode: EXAM ANSWER. Use marking-scheme structure: define → derive → substitute → box final answer. Examiner-friendly but Hinglish tone intact.`,
  master:`Mode: JEE/NEET MASTER. Full depth + link 1 relevant PYQ (year + exam) + common trap students fall for.`,
};

// Length-only guidance. NO tier name leaks into the prompt.
const LENGTH: Record<Tier, string> = {
  free:    `Keep the reply under ~120 words. Single-shot — no follow-up assumed.`,
  pro:     `Keep the reply under ~250 words. Use recent context if relevant.`,
  pro_plus:`No hard length cap; prefer concise. Use recent context if relevant.`,
};

export function buildSystemPrompt(tier: Tier, mode: Mode, subject?: string): string {
  const parts = [PERSONALITY, FORMATTING, TEACHING[mode], LENGTH[tier]];
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

// Adaptive output length: base cap (tier) × complexity factor (question).
// Hard ceiling of 1200 tokens applies in the edge function — see jeenie/index.ts.
export function computeMaxTokens(tier: Tier, question: string, hasImage: boolean): number {
  const base = tier === "free" ? 400 : tier === "pro" ? 700 : 1200;
  const q = (question || "").trim();
  const words = q.split(/\s+/).length;

  const isShortFact = words < 15 && !/[=∫Σ]/.test(q) && !/\d.*[+\-*/].*\d/.test(q);
  const isNumeric = /[=∫Σ√]/.test(q) || /\b(derive|prove|solve|calculate)\b/i.test(q);
  const isMultiPart = /\b(everything|all|complete|entire chapter|full)\b/i.test(q);

  let factor = 0.6;
  if (isShortFact && !hasImage) factor = 0.3;
  if (isNumeric || hasImage) factor = 1.0;
  if (isMultiPart) factor = 1.0;

  return Math.max(150, Math.round(base * factor));
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
const FORBIDDEN_RX = /\b(pro\s*plus|pro\+|pro plan|premium|subscription|subscribe|upgrade|upgraded|paid plan|free tier|free plan|trial|quota|credits?|pricing|paywall|locked behind)\b/i;

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

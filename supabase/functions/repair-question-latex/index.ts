// Repairs questions whose maths formatting was stripped during import.
// Sends the damaged text to the free Gemini Flash model and asks it to
// restore proper LaTeX (superscripts, subscripts, fractions, integrals).
// Safe to re-run: it only touches rows still flagged as `text_quality = 'damaged'`.
import { createClient } from "npm:@supabase/supabase-js@2";
import { callLovableAiGateway } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-setup-token",
};

const SETUP_TOKEN = "qa-repair-latex-2026-jeenie";

const SYSTEM = `You restore broken JEE/NEET question text.
The text lost its superscripts, subscripts and fraction markup during a bad import, so
things like "x^2" became "x 2", "log_10" became "log 10", "\\frac{a}{b}" became "a b".
Rewrite the text so it renders correctly, using inline LaTeX between $...$ for every
mathematical expression. Rules:
- NEVER change the meaning, numbers, or the physics/chemistry/maths content.
- Do not answer the question, do not add commentary.
- Keep plain English words as plain text; only wrap the maths in $...$.
- Fix obvious mojibake characters (Â, Ã, ï¿½) by removing or correcting them.
- Return STRICT JSON only: {"question_text": "...", "options": ["...","...","...","..."], "explanation": "..."}
- If options or explanation were empty, return them as empty array / empty string.`;

async function repairOne(row: any) {
  const payload = {
    question_text: row.question_text ?? "",
    options: row.options ?? [],
    explanation: row.explanation ?? "",
  };

  const result = await callLovableAiGateway({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: 0.1,
  });
  const raw = result.text;
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed?.question_text || typeof parsed.question_text !== "string") {
    throw new Error("bad_ai_shape");
  }
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.headers.get("x-setup-token") !== SETUP_TOKEN) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "missing LOVABLE_API_KEY" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let limit = 40;
  try {
    const body = await req.json();
    if (Number.isFinite(body?.limit)) limit = Math.min(Math.max(1, Number(body.limit)), 200);
  } catch (_) { /* default */ }

  const { data: rows, error } = await admin.rpc("next_damaged_questions", { p_limit: limit });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let repaired = 0;
  let failed = 0;
  let rateLimited = false;
  const startedAt = Date.now();
  const CONCURRENCY = 5;

  const queue = [...(rows ?? [])];
  async function worker() {
    while (queue.length > 0 && !rateLimited && Date.now() - startedAt < 45_000) {
      const row = queue.shift();
      if (!row) return;
      try {
        const fixed = await repairOne(row);
        const update: Record<string, unknown> = { question_text: fixed.question_text };
        if (Array.isArray(fixed.options) && fixed.options.length > 0) update.options = fixed.options;
        if (typeof fixed.explanation === "string" && fixed.explanation.trim()) {
          update.explanation = fixed.explanation;
        }
        const { error: upErr } = await admin.from("questions").update(update).eq("id", row.id);
        if (upErr) throw new Error(upErr.message);
        repaired += 1;
      } catch (e) {
        if (String(e).includes("rate_limited")) { rateLimited = true; return; }
        failed += 1;
        // Park it so the queue keeps moving; a human can review later.
        await admin.from("questions").update({ text_quality: "needs_review" }).eq("id", row.id);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));


  const { count } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("text_quality", "damaged");

  return new Response(
    JSON.stringify({ ok: true, repaired, failed, rate_limited: rateLimited, remaining: count ?? null }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

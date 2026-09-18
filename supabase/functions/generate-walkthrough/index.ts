import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callLovableAiGateway,
  gatewayErrorResponse,
  LOVABLE_AI_MODEL,
} from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Step {
  ask: string;
  options: { text: string; correct: boolean }[];
  hint?: string;
  result: string;
}

const SYSTEM = `You are JEEnie, an Indian exam mentor who teaches the METHOD, never just the answer.

You are given one multiple-choice or numerical question with its correct answer and explanation.
Break the solution into 3 to 4 decision steps. At every step the student must CHOOSE, not read.

Rules:
- Each step asks ONE short conceptual decision (what principle, what formula, what value).
- Exactly 2 options per step: one correct, one a realistic mistake a student actually makes.
- "result" is the single line of working that gets added once the step is answered right.
- "hint" is one short nudge shown if they pick wrong. Warm, never insulting.
- Language: simple Hinglish, short sentences. No greetings, no names, no emojis.
- Maths MUST be LaTeX inside \\( ... \\) for inline. NEVER use MathML, never use $ signs.
- The final step must land exactly on the given correct answer.

Return ONLY raw JSON, no markdown fences:
{"steps":[{"ask":"...","options":[{"text":"...","correct":true},{"text":"...","correct":false}],"hint":"...","result":"..."}],"final":"..."}`;

function parseSteps(raw: string): { steps: Step[]; final: string } | null {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  const obj = parsed as { steps?: unknown; final?: unknown };
  if (!Array.isArray(obj.steps) || obj.steps.length < 2) return null;

  const steps: Step[] = [];
  for (const s of obj.steps.slice(0, 5)) {
    const step = s as Partial<Step>;
    if (typeof step.ask !== "string" || !Array.isArray(step.options)) return null;
    const options = step.options
      .filter((o) => o && typeof (o as Step["options"][0]).text === "string")
      .slice(0, 3)
      .map((o) => ({
        text: String((o as Step["options"][0]).text),
        correct: Boolean((o as Step["options"][0]).correct),
      }));
    if (options.length < 2 || !options.some((o) => o.correct)) return null;
    steps.push({
      ask: step.ask,
      options,
      hint: typeof step.hint === "string" ? step.hint : undefined,
      result: typeof step.result === "string" ? step.result : "",
    });
  }
  return { steps, final: typeof obj.final === "string" ? obj.final : "" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Sign in karke try kar." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Session expire ho gaya. Dobara login kar." }, 401);

    let body: { questionId?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }
    const questionId = typeof body.questionId === "string" ? body.questionId : "";
    if (!UUID_RE.test(questionId)) return json({ error: "questionId is required." }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Cache hit — this is the whole point: generate once, serve forever.
    const { data: cached } = await admin
      .from("question_walkthroughs")
      .select("steps")
      .eq("question_id", questionId)
      .maybeSingle();

    if (cached?.steps) {
      return json({ cached: true, ...(cached.steps as Record<string, unknown>) });
    }

    const { data: q, error: qErr } = await admin
      .from("questions")
      .select(
        "question, question_text, option_a, option_b, option_c, option_d, correct_option, correct_answer, numerical_answer, explanation, subject, chapter",
      )
      .eq("id", questionId)
      .maybeSingle();

    if (qErr || !q) return json({ error: "Question nahi mila." }, 404);

    const stem = (q.question_text || q.question || "").trim();
    if (!stem) return json({ error: "Is question ka text missing hai." }, 422);

    const answer =
      q.correct_answer ||
      (q.correct_option
        ? String(
            {
              A: q.option_a,
              B: q.option_b,
              C: q.option_c,
              D: q.option_d,
            }[String(q.correct_option).toUpperCase()] ?? q.correct_option,
          )
        : q.numerical_answer != null
          ? String(q.numerical_answer)
          : "");

    const prompt = [
      `Subject: ${q.subject ?? "—"} | Chapter: ${q.chapter ?? "—"}`,
      `Question: ${stem}`,
      q.option_a ? `A) ${q.option_a}` : "",
      q.option_b ? `B) ${q.option_b}` : "",
      q.option_c ? `C) ${q.option_c}` : "",
      q.option_d ? `D) ${q.option_d}` : "",
      `Correct answer: ${answer || "(see explanation)"}`,
      q.explanation ? `Reference explanation: ${q.explanation}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await callLovableAiGateway({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      maxTokens: 1600,
      temperature: 0.4,
    });

    const parsed = parseSteps(result.text);
    if (!parsed) {
      return json({ error: "Walkthrough abhi ban nahi paaya. Dobara try kar." }, 502);
    }

    await admin.from("question_walkthroughs").upsert(
      {
        question_id: questionId,
        steps: parsed,
        model: LOVABLE_AI_MODEL,
      },
      { onConflict: "question_id" },
    );

    return json({ cached: false, ...parsed });
  } catch (error) {
    console.error("generate-walkthrough failed", error);
    const gateway = gatewayErrorResponse(error);
    return json(gateway.body, gateway.status);
  }
});

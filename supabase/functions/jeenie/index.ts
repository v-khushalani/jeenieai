import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildSystemPrompt,
  detectMode,
  detectLengthIntent,
  computeMaxTokens,
  estimateCostInr,
  resolveTier,
  scrubTierMentions,
  buildRoastPrompt,
  type Mode,
  type ModeSource,
  type Tier,
} from "../_shared/jeeniePrompt.ts";
import {
  callLovableAiGateway,
  gatewayErrorResponse,
  LOVABLE_AI_MODEL,
  type GatewayMessage,
} from "../_shared/ai-gateway.ts";

// Hard per-request output ceiling. Auto-retry path can grow up to this on
// truncation. Default budgets stay tight (see computeMaxTokens) — only
// truncated responses get the extra headroom, so cost stays minimal.
const MAX_OUTPUT_TOKENS_CEILING = 4000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Keep in sync with src/constants/aiLimits.ts
const FREE_AI_DAILY_LIMIT = 5;
const PRO_AI_DAILY_LIMIT = 20;
const PRO_PLUS_AI_DAILY_LIMIT = 50;
const DAILY_LIMIT_BY_TIER: Record<string, number> = {
  free: FREE_AI_DAILY_LIMIT,
  pro: PRO_AI_DAILY_LIMIT,
  pro_plus: PRO_PLUS_AI_DAILY_LIMIT,
};
const MONTHLY_LIMIT_BY_TIER: Record<string, number> = {
  free: 50,
  pro: 400,
  pro_plus: 1000,
};
const MIN_INTERVAL_SECONDS_BY_TIER: Record<string, number> = {
  free: 20,
  pro: 8,
  pro_plus: 4,
};
const MAX_INPUT_CHARS = 2500;
// In-memory de-dupe: identical question from same user within 15s is blocked.
const RECENT_PROMPTS = new Map<string, number>(); // key: `${userId}|${hash}` → ts
const DEDUPE_WINDOW_MS = 15_000;
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}
function gcRecentPrompts() {
  const now = Date.now();
  if (RECENT_PROMPTS.size < 500) return;
  for (const [k, v] of RECENT_PROMPTS) {
    if (now - v > DEDUPE_WINDOW_MS) RECENT_PROMPTS.delete(k);
  }
}

async function callGateway(
  messages: GatewayMessage[],
  maxTokens: number,
): Promise<{ text: string | null; usage?: { prompt_tokens?: number; completion_tokens?: number }; finishReason?: string }> {
  const result = await callLovableAiGateway({ messages, maxTokens, temperature: 0.7 });
  return { text: result.text, usage: result.usage, finishReason: result.finishReason };
}

// Rough char-based token estimate when the provider doesn't return usage.
const estTokens = (s: string) => Math.ceil((s || "").length / 4);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ response: "**Oye!** 🧞‍♂️\n\nPehle login kar, phir baat karte hain! 🔐", suggestions: [], content: "" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ response: "**Oye!** 🧞‍♂️\n\nSession expire ho gayi! Dobara login kar. 🔄", suggestions: [], content: "" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Peek body once so we can branch (roast mode bypasses quota/dedupe/char-cap)
    const body = await req.json().catch(() => ({}));

    // ── ROAST MODE: server-built prompt, no input cap, no dedupe, high temp.
    if (body?.mode === "roast") {
      const topic = String(body?.topic || "").slice(0, 120) || "this chapter";
      const accuracy = Number(body?.accuracy ?? 0);
      const excludeRoasts: string[] = Array.isArray(body?.excludeRoasts)
        ? body.excludeRoasts.slice(0, 10).map((s: unknown) => String(s).slice(0, 250))
        : [];
      const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${user.id.slice(0, 6)}`;

      const roastPrompt = buildRoastPrompt({ topic, accuracy, excludeRoasts, seed });
      const messages = [
        { role: "system", content: roastPrompt },
        { role: "user", content: `Roast me on "${topic}" (${Math.round(accuracy)}%). One line. Go.` },
      ];

      const roastText = (await callLovableAiGateway({
        messages: messages as GatewayMessage[],
        temperature: 1.1,
        maxTokens: 120,
      })).text;

      const latency = Date.now() - startedAt;
      console.log(`[JEENIE:roast] acc=${accuracy} topic="${topic}" ok=${!!roastText} ${latency}ms`);

      return new Response(
        JSON.stringify({
          response: roastText || "",
          content: roastText || "",
          suggestions: [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_premium, subscription_end_date, subscription_tier, subscription_status")
      .eq("id", user.id)
      .single();

    const userTier: Tier = resolveTier(profile);
    const isPremium = userTier !== "free";

    {
      const dailyLimit = DAILY_LIMIT_BY_TIER[userTier] ?? FREE_AI_DAILY_LIMIT;
      const monthlyLimit = MONTHLY_LIMIT_BY_TIER[userTier] ?? MONTHLY_LIMIT_BY_TIER.free;
      const minIntervalSec = MIN_INTERVAL_SECONDS_BY_TIER[userTier] ?? MIN_INTERVAL_SECONDS_BY_TIER.free;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [todayRes, monthRes, lastRes] = await Promise.all([
        supabase.from("points_log").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).eq("action_type", "ai_query")
          .gte("created_at", today.toISOString()),
        supabase.from("points_log").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).eq("action_type", "ai_query")
          .gte("created_at", monthStart.toISOString()),
        supabase.from("points_log").select("created_at")
          .eq("user_id", user.id).eq("action_type", "ai_query")
          .order("created_at", { ascending: false }).limit(1),
      ]);

      const queriesUsed = todayRes.count || 0;
      const monthlyUsed = monthRes.count || 0;
      const lastTs = lastRes.data?.[0]?.created_at ? new Date(lastRes.data[0].created_at).getTime() : 0;
      const sinceLast = (Date.now() - lastTs) / 1000;

      // NOTE: Per-request min-interval throttle removed intentionally.
      // Students hated the "ruk X second" gate — daily/monthly caps + in-memory
      // duplicate-prompt de-dupe (RECENT_PROMPTS below) are enough to prevent abuse.
      void sinceLast;
      void minIntervalSec;

      if (queriesUsed >= dailyLimit) {
        const msg = userTier === "pro_plus"
          ? `**Oye!** 🧞‍♂️\n\nAaj ke doubts khatam ho gaye! 😅 Kal fresh ho ke wapas aa — main ready rahunga! 💪`
          : userTier === "pro"
          ? `**Oye!** 🧞‍♂️\n\nAaj ke doubts khatam! 😅 **Pro+** pe upgrade kar — aur badi limit milegi. 🚀`
          : `**Oye!** 🧞‍♂️\n\nAaj ke free doubts khatam! 😅\n\n**Pro** ya **Pro+** pe upgrade kar — unlimited learning! 🚀`;
        return new Response(
          JSON.stringify({
            response: msg, suggestions: [], content: "",
            quota_exhausted: true,
            limit_type: "daily",
            tier: userTier,
            upgrade_to: userTier === "free" ? "pro" : userTier === "pro" ? "pro_plus" : null,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (monthlyUsed >= monthlyLimit) {
        const msg = userTier === "free"
          ? `**Oye!** 🧞‍♂️\n\nIs mahine ka free quota khatam! 😅\n\n**Pro** ya **Pro+** pe upgrade kar. 🚀`
          : userTier === "pro"
          ? `**Oye!** 🧞‍♂️\n\nIs mahine ka quota khatam! 😅\n\n**Pro+** pe upgrade kar. 🚀`
          : `**Oye!** 🧞‍♂️\n\nIs mahine ka quota khatam ho gaya! 😅\n\n📅 Next month reset hoga.`;
        return new Response(
          JSON.stringify({
            response: msg, suggestions: [], content: "",
            quota_exhausted: true,
            limit_type: "monthly",
            tier: userTier,
            upgrade_to: userTier === "free" ? "pro" : userTier === "pro" ? "pro_plus" : null,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }


    }


    const {
      contextPrompt,
      subject,
      conversationHistory,
      image,
      mode: rawMode,
      modeSource: rawModeSource,
    }: {
      contextPrompt: string;
      subject?: string;
      conversationHistory?: Array<{ role: string; content: string }>;
      image?: string;
      mode?: Mode | "auto";
      modeSource?: ModeSource;
    } = body;

    if (!contextPrompt || contextPrompt.length > MAX_INPUT_CHARS) {
      return new Response(
        JSON.stringify({
          response: `**Oye!** 🧞‍♂️\n\nAbbe yaar, pura chapter hi paste kar diya kya? 😂 Itna lamba doubt mat bhej, break it down — **${MAX_INPUT_CHARS} characters max** hi handle kar paunga.`,
          suggestions: [], content: "",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // De-dupe: identical prompt from same user within 60s is rejected silently.
    {
      gcRecentPrompts();
      const key = `${user.id}|${djb2((contextPrompt || "").trim().toLowerCase())}`;
      const last = RECENT_PROMPTS.get(key) || 0;
      if (Date.now() - last < DEDUPE_WINDOW_MS) {
        return new Response(
          JSON.stringify({
            response: "**Oye!** 🧞‍♂️\n\nAbhi-abhi same question puchha tha! 😄 Pehle wala answer scroll kar le — ya thoda alag word use kar.",
            suggestions: [], content: "",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      RECENT_PROMPTS.set(key, Date.now());
    }


    // Resolve mode: explicit override wins, else auto-detect.
    const hasImage = !!image;
    const resolvedMode: Mode = rawMode && rawMode !== "auto"
      ? (rawMode as Mode)
      : detectMode(contextPrompt, hasImage);
    const modeSource: ModeSource = rawMode && rawMode !== "auto"
      ? (rawModeSource || "manual")
      : "auto";

    // Detect explicit user length intent ("1 line", "sirf answer", "in detail"…).
    // This overrides tier/mode token budgets — student's words win.
    const lengthIntent = detectLengthIntent(contextPrompt);

    const systemPrompt = buildSystemPrompt(userTier, resolvedMode, subject, lengthIntent);
    const maxTokens = Math.min(
      computeMaxTokens(userTier, contextPrompt, hasImage, lengthIntent),
      MAX_OUTPUT_TOKENS_CEILING,
    );

    // History window: give every tier real conversation memory so follow-ups work.
    // Free = last 6 turns, Pro = 10, Pro+ = 16.
    const historyWindow = userTier === "pro_plus" ? 16 : userTier === "pro" ? 10 : 6;
    const messages: GatewayMessage[] = [
      { role: "system", content: systemPrompt },
    ];
    if (historyWindow > 0 && conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-historyWindow)) {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role === "assistant" ? "assistant" : "user", content: msg.content });
        }
      }
    }

    if (image) {
      console.log("[JEENIE] 📸 Image received — vision mode");
      messages.push({
        role: "user",
        content: [
          { type: "text", text: contextPrompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
        ],
      });
    } else {
      messages.push({ role: "user", content: contextPrompt });
    }

    // Single free-tier model for every user/mode — no paid Pro model routing.
    const primaryModel = LOVABLE_AI_MODEL;

    let responseText: string | null = null;
    let provider = "fallback";
    let modelUsed = primaryModel;
    let fallbackUsed: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;

    const primary = await callGateway(messages, maxTokens);
    if (primary.text) {
      responseText = primary.text;
      provider = "-gateway";
      inputTokens = primary.usage?.prompt_tokens ?? estTokens(systemPrompt + contextPrompt);
      outputTokens = primary.usage?.completion_tokens ?? estTokens(primary.text);
    }

    // 🔁 Silent auto-retry on truncation. If the model stopped because it hit
    // the output cap (finish_reason === "length"), retry once with a larger
    // budget so the student never sees a cut-off answer. User never knows.
    // Only triggers when user did NOT explicitly ask for ultra-short/short.
    const truncated = primary.finishReason === "length";
    const userWantsShort = lengthIntent === "ultra_short" || lengthIntent === "short";
    if (truncated && !userWantsShort && responseText) {
      const retryTokens = Math.min(Math.max(maxTokens * 2, 1200), MAX_OUTPUT_TOKENS_CEILING);
      if (retryTokens > maxTokens) {
        console.log(`[JEENIE] ✂️ Truncated at ${maxTokens} → silent retry with ${retryTokens}`);
        // Nudge the model: continue from scratch with explicit "complete it" instruction.
        const retryMessages = [
          ...messages.slice(0, -1),
          {
            role: "user",
            content: typeof messages[messages.length - 1].content === "string"
              ? `${messages[messages.length - 1].content}\n\n(Important: pichli baar reply beech mein kat gayi thi. Is baar complete answer dena — concise but never truncated. Skip unnecessary fluff.)`
              : messages[messages.length - 1].content,
          },
        ];
        const retry = await callGateway(retryMessages as GatewayMessage[], retryTokens);
        if (retry.text && retry.text.length > responseText.length * 0.9) {
          responseText = retry.text;
          inputTokens = retry.usage?.prompt_tokens ?? inputTokens;
          outputTokens = retry.usage?.completion_tokens ?? estTokens(retry.text);
          fallbackUsed = fallbackUsed ? `${fallbackUsed}+retry_truncation` : "retry_truncation";
        }
      }
    }

    if (!responseText) {
      throw new Error("JEEnie returned an empty response.");
    }

    // Tier-blindness scrub — if the model leaked any plan/upgrade word, strip
    // those sentences and replace with a neutral redirect. We log it so we can
    // monitor false positives via the analytics panel.
    const scrubbed = scrubTierMentions(responseText);
    if (scrubbed.tripped) {
      responseText = scrubbed.text;
      fallbackUsed = fallbackUsed ? `${fallbackUsed}+tier_scrub` : "tier_scrub";
    }

    const latencyMs = Date.now() - startedAt;
    const estimatedCostInr = estimateCostInr(modelUsed, inputTokens, outputTokens);

    console.log(`[JEENIE] 📊 ${provider} | tier=${userTier} mode=${resolvedMode}(${modeSource}) intent=${lengthIntent} model=${modelUsed} in=${inputTokens} out=${outputTokens} cost=₹${estimatedCostInr} ${latencyMs}ms${fallbackUsed ? ` fallback=${fallbackUsed}` : ""}`);

    // Quota counter (unchanged).
    supabase.from("points_log").insert({
      user_id: user.id,
      action_type: "ai_query",
      points: 0,
      description: `${provider}${subject ? ` | ${subject}` : ""} | ${resolvedMode}`,
    }).then(() => {}, () => {});

    // Telemetry row for cost analytics.
    supabase.from("ai_request_log").insert({
      user_id: user.id,
      tier: userTier,
      mode: resolvedMode,
      mode_source: modeSource,
      model: modelUsed,
      input_tokens: inputTokens || null,
      output_tokens: outputTokens || null,
      latency_ms: latencyMs,
      estimated_cost_inr: estimatedCostInr,
      had_image: hasImage,
      fallback_used: fallbackUsed,
      subject: subject || null,
    }).then(() => {}, () => {});

    return new Response(
      JSON.stringify({
        response: responseText.trim(),
        suggestions: [],
        content: responseText.trim(),
        resolvedMode,
        modeSource,
        tier: userTier,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[JEENIE] 🚨 CATASTROPHIC ERROR:", error);
    const failure = gatewayErrorResponse(error);
    return new Response(
      JSON.stringify(failure.body),
      { status: failure.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

});

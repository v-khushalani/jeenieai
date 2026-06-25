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
  type Mode,
  type ModeSource,
  type Tier,
} from "../_shared/jeeniePrompt.ts";

// Hard per-request output ceiling. Auto-retry path can grow up to this on
// truncation. Default budgets stay tight (see computeMaxTokens) — only
// truncated responses get the extra headroom, so cost stays minimal.
const MAX_OUTPUT_TOKENS_CEILING = 2500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FREE_AI_DAILY_LIMIT = 20;
const PRO_MODEL_ENABLED = Deno.env.get("JEENIE_PRO_MODEL_ENABLED") === "true";

const FUNNY_FALLBACKS = [
  "**Hello Puttar!** 🧞‍♂️\n\nAre yaar! JEEnie ka chirag thoda garam ho gaya hai! 🔥😅\n\nEk minute ruk, thanda hone de... phir tera doubt pakka solve karunga! 💪\n\n⏰ **2 second mein dobara try kar!**",
  "**Hello Puttar!** 🧞‍♂️\n\nJEEnie abhi chai pe gaya tha! ☕😎\n\nWapas aa gaya hoon — ab bol, kya doubt hai?\n\n💡 **Dobara send kar apna question!**",
  "**Hello Puttar!** 🧞‍♂️\n\nServer pe traffic jam ho gaya — Mumbai ki tarah! 🚗😤\n\nBut don't worry, JEEnie ke paas shortcut hai! 🛣️\n\n✨ **Try again, is baar express lane milega!**",
  "**Hello Puttar!** 🧞‍♂️\n\nJEEnie ke neurons mein short circuit ho gaya! ⚡😱\n\nBut don't worry — Faraday ke law se recharge ho raha hoon!\n\n🔋 **10 second mein dobara try kar!**",
];

function getRandomFunnyFallback(): string {
  return FUNNY_FALLBACKS[Math.floor(Math.random() * FUNNY_FALLBACKS.length)];
}


async function callLovableGateway(
  messages: Array<{ role: string; content: any }>,
  model: string,
  maxTokens: number,
): Promise<{ text: string | null; usage?: { prompt_tokens?: number; completion_tokens?: number }; finishReason?: string }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) { console.error("[JEENIE] ❌ LOVABLE_API_KEY not configured"); return { text: null }; }
  try {
    console.log(`[JEENIE] 🔄 Lovable AI Gateway → ${model} (max ${maxTokens})`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) { const err = await res.text(); console.error(`[JEENIE] ❌ Gateway ${res.status}:`, err.substring(0, 300)); return { text: null }; }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    const finishReason = data.choices?.[0]?.finish_reason;
    return { text: text || null, usage: data.usage, finishReason };
  } catch (e) { console.error("[JEENIE] ❌ Gateway error:", e); return { text: null }; }
}


async function callGemini(prompt: string, apiKey: string): Promise<string | null> {
  try {
    console.log("[ADMIN] 🔄 Trying Gemini (fallback)...");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) { const err = await res.text(); console.error(`[ADMIN] ❌ Gemini failed (${res.status}):`, err.substring(0, 300)); return null; }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) { console.log("[ADMIN] ✅ Gemini success"); return text; }
    return null;
  } catch (e) { console.error("[ADMIN] ❌ Gemini error:", e); return null; }
}

async function callOpenAI(systemPrompt: string, prompt: string, maxTokens: number, apiKey: string): Promise<string | null> {
  try {
    console.log("[JEENIE] 🔄 Trying OpenAI (fallback)...");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }], temperature: 0.7, max_tokens: maxTokens }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) { const err = await res.text(); console.error(`[JEENIE] ❌ OpenAI failed (${res.status}):`, err.substring(0, 300)); return null; }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    return text || null;
  } catch (e) { console.error("[JEENIE] ❌ OpenAI error:", e); return null; }
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
        JSON.stringify({ response: "**Hello Puttar!** 🧞‍♂️\n\nPehle login kar, phir baat karte hain! 🔐", suggestions: [], content: "" }),
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
        JSON.stringify({ response: "**Hello Puttar!** 🧞‍♂️\n\nSession expire ho gayi! Dobara login kar. 🔄", suggestions: [], content: "" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_premium, subscription_end_date, subscription_tier, subscription_status")
      .eq("id", user.id)
      .single();

    const userTier: Tier = resolveTier(profile);
    const isPremium = userTier !== "free";

    if (!isPremium) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: todayQueries } = await supabase.from("points_log").select("id").eq("user_id", user.id).eq("action_type", "ai_query").gte("created_at", today.toISOString());
      const queriesUsed = todayQueries?.length || 0;
      if (queriesUsed >= FREE_AI_DAILY_LIMIT) {
        return new Response(
          JSON.stringify({
            response: `**Hello Puttar!** 🧞‍♂️\n\nAaj ke ${FREE_AI_DAILY_LIMIT} free queries khatam ho gaye! 😅\n\n💎 **Premium le lo** — unlimited AI help, voice features, aur bahut kuch!\n\n⏰ Naye free queries kal milenge.`,
            suggestions: [], content: "",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const body = await req.json();
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

    if (!contextPrompt || contextPrompt.length > 8000) {
      return new Response(
        JSON.stringify({
          response: "**Hello Puttar!** 🧞‍♂️\n\nItna lamba question?! 😅 Thoda chhota karke puch — 8000 characters max!\n\n✂️ **Short & sweet question = fast & accurate answer!**",
          suggestions: [], content: "",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // History window: trim by tier. Free = single-shot.
    const historyWindow = userTier === "free" ? 0 : userTier === "pro" ? 4 : 6;
    const messages: Array<{ role: string; content: any }> = [
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

    // Model routing: Pro+ deep/master may route to Pro model when flag enabled.
    const usePro = PRO_MODEL_ENABLED && userTier === "pro_plus" && (resolvedMode === "deep" || resolvedMode === "master");
    const primaryModel = usePro ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";

    let responseText: string | null = null;
    let provider = "fallback";
    let modelUsed = primaryModel;
    let fallbackUsed: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;

    const primary = await callLovableGateway(messages, primaryModel, maxTokens);
    if (primary.text) {
      responseText = primary.text;
      provider = "lovable-gateway";
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
        const retry = await callLovableGateway(retryMessages, primaryModel, retryTokens);
        if (retry.text && retry.text.length > responseText.length * 0.9) {
          responseText = retry.text;
          inputTokens = retry.usage?.prompt_tokens ?? inputTokens;
          outputTokens = retry.usage?.completion_tokens ?? estTokens(retry.text);
          fallbackUsed = fallbackUsed ? `${fallbackUsed}+retry_truncation` : "retry_truncation";
        }
      }
    }

    if (!responseText && !image) {
      const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
      if (GEMINI_KEY) {
        const flatPrompt = `${systemPrompt}\n\nQuestion: ${contextPrompt}\n\nAnswer:`;
        responseText = await callGemini(flatPrompt, GEMINI_KEY);
        if (responseText) {
          provider = "gemini-direct";
          fallbackUsed = "gemini";
          modelUsed = "google/gemini-2.5-flash";
          inputTokens = estTokens(flatPrompt);
          outputTokens = estTokens(responseText);
        }
      }
    }

    if (!responseText && !image) {
      const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
      if (OPENAI_KEY) {
        responseText = await callOpenAI(systemPrompt, contextPrompt, maxTokens, OPENAI_KEY);
        if (responseText) {
          provider = "openai";
          fallbackUsed = "openai";
          modelUsed = "openai/gpt-4o-mini";
          inputTokens = estTokens(systemPrompt + contextPrompt);
          outputTokens = estTokens(responseText);
        }
      }
    }

    if (!responseText) {
      console.error("[JEENIE] 🚨 ALL AI PROVIDERS FAILED! Using humor fallback.");
      responseText = getRandomFunnyFallback();
      provider = "humor-fallback";
      fallbackUsed = "humor";
    }

    // Tier-blindness scrub — if the model leaked any plan/upgrade word, strip
    // those sentences and replace with a neutral redirect. We log it so we can
    // monitor false positives via the analytics panel.
    if (provider !== "humor-fallback") {
      const scrubbed = scrubTierMentions(responseText);
      if (scrubbed.tripped) {
        responseText = scrubbed.text;
        fallbackUsed = fallbackUsed ? `${fallbackUsed}+tier_scrub` : "tier_scrub";
      }
    }

    const latencyMs = Date.now() - startedAt;
    const estimatedCostInr = provider === "humor-fallback" ? 0 : estimateCostInr(modelUsed, inputTokens, outputTokens);

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
    const funnyMsg = getRandomFunnyFallback();
    return new Response(
      JSON.stringify({ response: funnyMsg, suggestions: [], content: funnyMsg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

});

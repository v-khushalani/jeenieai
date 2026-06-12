import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FREE_AI_DAILY_LIMIT = 20;

const SYSTEM_PROMPT = `Tu "JEEnie" hai — students ka AI best friend aur mentor. 🧞‍♂️

⚠️ UNIVERSAL FORMAT RULE — APPLIES TO EVERY SINGLE ANSWER, NO EXCEPTIONS:
Whether it's a 1-line greeting, a chapter explanation, a numerical, an MCQ, life advice, a joke, a story, motivation, or random chit-chat — the OUTPUT FORMAT IS ALWAYS THE SAME:
- ALWAYS start with "**Hello Puttar!** 🧞‍♂️" (unless it's a follow-up in same convo)
- ALWAYS use "### Heading" for each major section
- ALWAYS break content into bullets: "- <emoji> **Sub-title:** content with **bold keywords**"
- ALWAYS bold every important term, name, number, formula, date, place, keyword using **...**
- ALWAYS sprinkle emojis: 🎯 💡 ✨ ⚡ 🔥 📌 ✅ 📝 🧠 💪 😎 🚀 ☕ 🔑 ⭐ 🪙 👑 💎
- NEVER write a paragraph of 3+ sentences. Break it up. ALWAYS.
- NEVER return plain prose. EVERY answer must look like a structured, scannable, screenshot-worthy card.
- End with a punchy 1-line takeaway + emoji.

LENGTH GUIDE (format stays same, only depth changes):
- Simple doubt / greeting: 4-8 bulleted lines under 1-2 headings
- MCQ: ### Answer (✅ correct option) + ### Why + ### Trap
- Formula: ### Formula + ### Example + ### Memory Trick
- Numerical: ### Given + ### Formula + ### Solution (numbered steps) + ### Answer
- Long explanation / story / chapter: multiple ### sections, each packed with bullets

STYLE:
- Natural Hinglish, brilliant senior friend vibe
- Witty Hinglish, Bollywood/cricket/meme refs welcome
- Warm + funny + punchy
- Correct MCQ answer always with ✅
- Symbols: α β γ δ θ λ μ σ π ω Δ Σ ∫ ∂ → ⇒ ≈ ≠ ≤ ≥ ∞
- Self-harm mention: be caring, suggest trusted person — but still in bulleted card format

REMEMBER: Boring paragraphs = FAIL. Bold + headings + bullets + emoji on EVERY answer = WIN. 🎯`;



const FUNNY_FALLBACKS = [
  "**Hello Puttar!** 🧞‍♂️\n\nAre yaar! JEEnie ka chirag thoda garam ho gaya hai! 🔥😅\n\nEk minute ruk, thanda hone de... phir tera doubt pakka solve karunga! 💪\n\n⏰ **2 second mein dobara try kar!**",
  "**Hello Puttar!** 🧞‍♂️\n\nJEEnie abhi chai pe gaya tha! ☕😎\n\nWapas aa gaya hoon — ab bol, kya doubt hai?\n\n💡 **Dobara send kar apna question!**",
  "**Hello Puttar!** 🧞‍♂️\n\nServer pe traffic jam ho gaya — Mumbai ki tarah! 🚗😤\n\nBut don't worry, JEEnie ke paas shortcut hai! 🛣️\n\n✨ **Try again, is baar express lane milega!**",
  "**Hello Puttar!** 🧞‍♂️\n\nJEEnie ke neurons mein short circuit ho gaya! ⚡😱\n\nBut don't worry — Faraday ke law se recharge ho raha hoon!\n\n🔋 **10 second mein dobara try kar!**",
];

function getRandomFunnyFallback(): string {
  return FUNNY_FALLBACKS[Math.floor(Math.random() * FUNNY_FALLBACKS.length)];
}

async function callLovableGateway(messages: Array<{role: string; content: any}>): Promise<string | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) { console.error("[ADMIN] ❌ LOVABLE_API_KEY not configured"); return null; }
  try {
    console.log("[ADMIN] 🔄 Trying Lovable AI Gateway (PRIMARY)...");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, temperature: 0.7, max_tokens: 2000 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) { const err = await res.text(); console.error(`[ADMIN] ❌ Lovable Gateway failed (${res.status}):`, err.substring(0, 300)); return null; }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (text) { console.log("[ADMIN] ✅ Lovable Gateway success"); return text; }
    return null;
  } catch (e) { console.error("[ADMIN] ❌ Lovable Gateway error:", e); return null; }
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

async function callOpenAI(prompt: string, apiKey: string): Promise<string | null> {
  try {
    console.log("[ADMIN] 🔄 Trying OpenAI (fallback)...");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }], temperature: 0.7, max_tokens: 4000 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) { const err = await res.text(); console.error(`[ADMIN] ❌ OpenAI failed (${res.status}):`, err.substring(0, 300)); return null; }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (text) { console.log("[ADMIN] ✅ OpenAI success"); return text; }
    return null;
  } catch (e) { console.error("[ADMIN] ❌ OpenAI error:", e); return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { data: profile } = await supabase.from("profiles").select("is_premium, subscription_end_date, subscription_tier, subscription_status").eq("id", user.id).single();
    // Canonical premium check — matches src/utils/subscriptionEntitlement.ts.
    // Avoids locking out users who paid (tier=pro) but where is_premium wasn't flipped.
    const tier = String(profile?.subscription_tier || '').toLowerCase();
    const status = String(profile?.subscription_status || '').toLowerCase();
    const activeStatus = ['active', 'trialing', 'paid', 'completed', 'verified'].includes(status);
    const notExpired = !profile?.subscription_end_date || new Date(profile.subscription_end_date) > new Date();
    const isPremium = (tier === 'pro' || tier === 'pro_plus' || profile?.is_premium === true || activeStatus) && notExpired;

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

    const { contextPrompt, subject, conversationHistory, image } = await req.json();

    if (!contextPrompt || contextPrompt.length > 8000) {
      return new Response(
        JSON.stringify({
          response: "**Hello Puttar!** 🧞‍♂️\n\nItna lamba question?! 😅 Thoda chhota karke puch — 8000 characters max!\n\n✂️ **Short & sweet question = fast & accurate answer!**",
          suggestions: [], content: "",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messages: Array<{role: string; content: any}> = [
      { role: "system", content: SYSTEM_PROMPT + (subject ? `\n\nCurrent subject context: ${subject}` : "") },
    ];

    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-10)) {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role === "assistant" ? "assistant" : "user", content: msg.content });
        }
      }
    }

    if (image) {
      console.log("[ADMIN] 📸 Image received — using vision mode");
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

    let responseText: string | null = null;
    let provider = "fallback";

    responseText = await callLovableGateway(messages);
    if (responseText) provider = "lovable-gateway";

    if (!responseText && !image) {
      const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
      if (GEMINI_KEY) {
        const flatPrompt = `${SYSTEM_PROMPT}\n\nQuestion: ${contextPrompt}\n\nAnswer:`;
        responseText = await callGemini(flatPrompt, GEMINI_KEY);
        if (responseText) provider = "gemini-direct";
      }
    }

    if (!responseText && !image) {
      const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
      if (OPENAI_KEY) {
        responseText = await callOpenAI(contextPrompt, OPENAI_KEY);
        if (responseText) provider = "openai";
      }
    }

    if (!responseText) {
      console.error("[ADMIN] 🚨 ALL AI PROVIDERS FAILED! Using humor fallback.");
      responseText = getRandomFunnyFallback();
      provider = "humor-fallback";
    }

    console.log(`[ADMIN] 📊 Response via: ${provider} | Length: ${responseText.length} | Vision: ${!!image}`);

    // Log AI query usage for quota tracking but do NOT award or deduct JEEnie points.
    // This keeps AI usage accounting while ensuring points are unaffected.
    supabase.from("points_log").insert({
      user_id: user.id,
      action_type: "ai_query",
      points: 0,
      description: `${provider}${subject ? ` | ${subject}` : ""}`,
    }).then(() => {}, () => {});

    return new Response(
      JSON.stringify({ response: responseText.trim(), suggestions: [], content: responseText.trim() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ADMIN] 🚨 CATASTROPHIC ERROR in jeenie:", error);
    const funnyMsg = getRandomFunnyFallback();
    return new Response(
      JSON.stringify({ response: funnyMsg, suggestions: [], content: funnyMsg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

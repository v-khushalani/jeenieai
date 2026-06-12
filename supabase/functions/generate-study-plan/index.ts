import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ORIGIN') || 'https://jeenie.website',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FUNNY_PLAN_FALLBACK = {
  personalizedGreeting: "Arre champion! 🏆 AI thoda busy hai aaj, but tera study plan toh ready hai!",
  strengthAnalysis: "Tere strong topics mein tu solid hai — keep it up! Revision pe focus kar aur mock tests de regularly.",
  weaknessStrategy: "Weak topics ko daily 1-2 hours do. Pehle basics clear karo, phir advanced problems try karo. Consistency is key! 💪",
  timeAllocation: { weakTopics: "2 hours/day", mediumTopics: "1.5 hours/day", revision: "1 hour/day", mockTests: "2 per week" },
  keyRecommendations: [
    "🎯 Weak topics ko subah fresh mind se padho — 6-8 AM best time hai!",
    "📝 Har din ek mock test section solve karo — speed + accuracy dono badhegi",
    "🔄 Revision cycle: Naye topics ke saath purane bhi revise karo (Spaced Repetition)",
    "⏰ Pomodoro technique use karo: 45 min study + 10 min break"
  ],
  motivationalMessage: "Bhai, topper woh nahi jo sab kuch jaanta hai — topper woh hai jo consistently padta hai! Tu kar sakta hai, bas rukna mat! 🔥🚀",
  rankPrediction: {
    currentProjection: "With consistent effort, strong results possible!",
    targetProjection: "Top 10% achievable with the right strategy",
    improvementPath: "Daily practice + weekly mock tests + smart revision = Success!"
  }
};

const AI_FETCH_TIMEOUT_MS = 6000;

async function fetchWithTimeout(input: string, init: RequestInit, label: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(`${label} timed out after ${AI_FETCH_TIMEOUT_MS}ms`), AI_FETCH_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callAI(prompt: string): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
  const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
  const GROQ_KEY = Deno.env.get("GROQ_API_KEY");

  // 1️⃣ Lovable AI Gateway — PRIMARY, no quota issues
  if (LOVABLE_API_KEY) {
    try {
      console.log("[ADMIN] 🔄 Study Plan: Trying Lovable AI Gateway (PRIMARY)...");
      const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are JEEnie, an expert study planner. Always respond with valid JSON only." },
            { role: "user", content: prompt }
          ],
          temperature: 0.6,
          max_tokens: 3000,
        }),
      }, 'Lovable study plan request');
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) { console.log("[ADMIN] ✅ Lovable AI study plan success"); return text; }
      } else {
        const errText = (await res.text()).substring(0, 300);
        console.error("[ADMIN] ❌ Lovable AI study plan:", res.status, errText);
      }
    } catch (e) { console.error("[ADMIN] ❌ Lovable AI error:", e); }
  }

  // 2️⃣ Gemini — fallback
  if (GEMINI_KEY) {
    try {
      console.log("[ADMIN] 🔄 Study Plan: Trying Gemini (fallback)...");
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.6, maxOutputTokens: 3000 },
          }),
        },
        'Gemini study plan request'
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) { console.log("[ADMIN] ✅ Gemini study plan success"); return text; }
      } else { console.error("[ADMIN] ❌ Gemini study plan:", res.status, (await res.text()).substring(0, 200)); }
    } catch (e) { console.error("[ADMIN] ❌ Gemini error:", e); }
  }

  // 3️⃣ OpenAI — fallback
  if (OPENAI_KEY) {
    try {
      console.log("[ADMIN] 🔄 Study Plan: Trying OpenAI (fallback)...");
      const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are JEEnie, an expert study planner. Always respond with valid JSON only." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7, max_tokens: 2000,
        }),
      }, 'OpenAI study plan request');
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) { console.log("[ADMIN] ✅ OpenAI study plan success"); return text; }
      } else { console.error("[ADMIN] ❌ OpenAI study plan:", res.status, (await res.text()).substring(0, 200)); }
    } catch (e) { console.error("[ADMIN] ❌ OpenAI error:", e); }
  }

  // 4️⃣ Groq — last resort
  if (GROQ_KEY) {
    try {
      console.log("[ADMIN] 🔄 Study Plan: Trying Groq (last resort)...");
      const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "You are JEEnie, an expert study planner. Always respond with valid JSON only." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7, max_tokens: 2000,
        }),
      }, 'Groq study plan request');
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) { console.log("[ADMIN] ✅ Groq study plan success"); return text; }
      } else { console.error("[ADMIN] ❌ Groq study plan:", res.status, (await res.text()).substring(0, 200)); }
    } catch (e) { console.error("[ADMIN] ❌ Groq error:", e); }
  }

  return null;
}

function parseAIResponse(raw: string): any {
  try {
    let cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last !== -1) cleaned = cleaned.substring(first, last + 1);
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("[ADMIN] ❌ JSON parse failed:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- AUTH CHECK ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Login required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Session expired. Please login again.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const body = await req.json();
    const targetExam = body.targetExam || body.goalExam || 'JEE/NEET';
    const studyHours = typeof body.studyHours === 'number' ? body.studyHours
      : (typeof body.availableHoursPerDay === 'number' ? body.availableHoursPerDay : 4);

    let daysRemaining = body.daysRemaining as number | undefined;
    if (daysRemaining == null && body.examDate) {
      const diff = new Date(body.examDate).getTime() - Date.now();
      daysRemaining = diff > 0 ? Math.ceil(diff / 86400000) : 0;
    }
    daysRemaining = daysRemaining ?? 90;

    const strengths = Array.isArray(body.strengths) ? body.strengths : [];
    const weaknesses = Array.isArray(body.weaknesses) ? body.weaknesses
      : (Array.isArray(body.weakTopics) ? body.weakTopics : []);
    const avgAccuracy = typeof body.avgAccuracy === 'number' ? body.avgAccuracy : 60;

    const formatTopics = (list: any[]) => list.length > 0
      ? list.map((t: any) => typeof t === 'string' ? t : `${t.subject || 'General'} - ${t.topic || t.name || 'Unknown'}: ${t.accuracy ?? 'N/A'}%`).join('\n')
      : 'No topics identified yet';

    const prompt = `You are JEEnie, an expert AI study planner for ${targetExam} aspirants.

**Student Profile:**
- Target: ${targetExam} | Days: ${daysRemaining} | Hours/day: ${studyHours} | Accuracy: ${avgAccuracy}%

**Strengths:** ${formatTopics(strengths)}
**Weak Areas:** ${formatTopics(weaknesses)}

Generate a personalized response in JSON format with these fields:
{
  "personalizedGreeting": "Warm, motivating 2-3 sentences in Hinglish",
  "strengthAnalysis": "Encouraging analysis 2-3 sentences",
  "weaknessStrategy": "Empathetic strategy 2-3 sentences",
  "timeAllocation": { "weakTopics": "X hours/day", "mediumTopics": "Y hours/day", "revision": "Z hours/day", "mockTests": "W per week" },
  "keyRecommendations": ["Rec 1", "Rec 2", "Rec 3"],
  "motivationalMessage": "Powerful motivational 2-3 sentences",
  "rankPrediction": { "currentProjection": "...", "targetProjection": "...", "improvementPath": "..." }
}

Use their actual numbers. Be encouraging but honest. Return ONLY valid JSON.`;

    const aiRaw = await callAI(prompt);
    const aiInsights = aiRaw ? parseAIResponse(aiRaw) : null;

    return new Response(
      JSON.stringify({
        success: true,
        insights: aiInsights || FUNNY_PLAN_FALLBACK,
        generatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[ADMIN] 🚨 Study plan catastrophic error:', error);
    return new Response(
      JSON.stringify({
        success: true,
        insights: FUNNY_PLAN_FALLBACK,
        generatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});

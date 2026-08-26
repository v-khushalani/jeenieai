import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callLovableAiGateway, gatewayErrorResponse } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ORIGIN') || 'https://jeenie.website',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function callAI(prompt: string): Promise<string> {
  const result = await callLovableAiGateway({
    messages: [
      { role: "system", content: "You are JEEnie, an expert study planner. Always respond with valid JSON only." },
      { role: "user", content: prompt },
    ],
    temperature: 0.6,
    maxTokens: 3000,
  });
  return result.text;
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
    const aiInsights = parseAIResponse(aiRaw);
    if (!aiInsights) throw new Error('The study plan response was not valid JSON.');

    return new Response(
      JSON.stringify({
        success: true,
        insights: aiInsights,
        generatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[ADMIN] 🚨 Study plan catastrophic error:', error);
    const failure = gatewayErrorResponse(error);
    return new Response(
      JSON.stringify({ success: false, ...failure.body, generatedAt: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: failure.status }
    );
  }
});

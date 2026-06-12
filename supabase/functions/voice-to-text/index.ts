import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ORIGIN') || 'https://jeenie.website',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ====================================================================
//  🎤 VOICE-TO-TEXT FALLBACK ENGINE v2.0
//  Chain: Groq Whisper → OpenAI Whisper → Gemini Audio → Funny fallback
//  Student NEVER sees error codes.
// ====================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- AUTH CHECK ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ text: "", message: "Pehle login kar puttar! 🔐" }),
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
        JSON.stringify({ text: "", message: "Session expire ho gayi! Dobara login kar. 🔄" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const { audio } = await req.json();

    if (!audio) {
      // No error code — friendly message
      return new Response(
        JSON.stringify({ text: "", message: "Arre puttar! Audio nahi mila 🎤 Dobara record karke bhej!" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanBase64 = audio.replace(/^data:audio\/\w+;base64,/, '');
    const GROQ_KEY = Deno.env.get('GROQ_API_KEY');
    const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');

    // 1️⃣ Groq Whisper (fastest, 30 RPM free)
    if (GROQ_KEY) {
      try {
        console.log("[ADMIN] 🔄 Voice: Trying Groq Whisper...");
        const binaryString = atob(cleanBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

        const formData = new FormData();
        formData.append('file', new Blob([bytes], { type: 'audio/webm' }), 'audio.webm');
        formData.append('model', 'whisper-large-v3');
        formData.append('language', 'en');

        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${GROQ_KEY}` },
          body: formData,
        });

        if (res.ok) {
          const result = await res.json();
          if (result.text) {
            console.log("[ADMIN] ✅ Groq Whisper success");
            return new Response(
              JSON.stringify({ text: result.text }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          console.error("[ADMIN] ❌ Groq Whisper:", res.status, (await res.text()).substring(0, 200));
        }
      } catch (e) { console.error("[ADMIN] ❌ Groq Whisper error:", e); }
    }

    // 2️⃣ OpenAI Whisper
    if (OPENAI_KEY) {
      try {
        console.log("[ADMIN] 🔄 Voice: Trying OpenAI Whisper...");
        const binaryString = atob(cleanBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

        const formData = new FormData();
        formData.append('file', new Blob([bytes], { type: 'audio/webm' }), 'audio.webm');
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');

        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${OPENAI_KEY}` },
          body: formData,
        });

        if (res.ok) {
          const result = await res.json();
          if (result.text) {
            console.log("[ADMIN] ✅ OpenAI Whisper success");
            return new Response(
              JSON.stringify({ text: result.text }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          console.error("[ADMIN] ❌ OpenAI Whisper:", res.status, (await res.text()).substring(0, 200));
        }
      } catch (e) { console.error("[ADMIN] ❌ OpenAI Whisper error:", e); }
    }

    // 3️⃣ Gemini Audio Transcription
    if (GEMINI_KEY) {
      try {
        console.log("[ADMIN] 🔄 Voice: Trying Gemini Audio...");
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: "Transcribe this audio exactly as spoken. Return ONLY the transcribed text. If Hinglish, transcribe as-is. If unclear, return empty string." },
                  { inline_data: { mime_type: "audio/webm", data: cleanBase64 } }
                ]
              }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 1000 },
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            console.log("[ADMIN] ✅ Gemini Audio success");
            return new Response(
              JSON.stringify({ text }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          console.error("[ADMIN] ❌ Gemini Audio:", res.status, (await res.text()).substring(0, 200));
        }
      } catch (e) { console.error("[ADMIN] ❌ Gemini Audio error:", e); }
    }

    // 4️⃣ All failed — funny fallback, not error
    console.error("[ADMIN] 🚨 ALL voice transcription providers failed!");
    return new Response(
      JSON.stringify({ text: "", message: "Arre puttar, audio thoda unclear tha! 🎤😅 Zara clear voice mein dobara bol!" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[ADMIN] 🚨 Voice-to-text catastrophic error:", error);
    return new Response(
      JSON.stringify({ text: "", message: "Mic pe thoda issue aaya! 🎤 Type karke puch le abhi ke liye!" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

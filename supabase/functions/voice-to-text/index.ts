import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callLovableAiGateway, gatewayErrorResponse } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ORIGIN') || 'https://jeenie.website',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ====================================================================
//  🎤 VOICE-TO-TEXT — Gemini multimodal through Lovable AI Gateway
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

    const { audio, mimeType: requestedMimeType } = await req.json();

    if (!audio) {
      // No error code — friendly message
      return new Response(
        JSON.stringify({ text: "", message: "Arre puttar! Audio nahi mila 🎤 Dobara record karke bhej!" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dataUrlMatch = String(audio).match(/^data:(audio\/[\w.+-]+);base64,(.+)$/s);
    const mimeType = dataUrlMatch?.[1] || (typeof requestedMimeType === 'string' ? requestedMimeType : 'audio/webm');
    const cleanBase64 = dataUrlMatch?.[2] || String(audio);
    const format = mimeType.split('/')[1]?.split(';')[0] || 'webm';
    const result = await callLovableAiGateway({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Transcribe this audio exactly as spoken. Return only the transcription. Preserve Hinglish as spoken.' },
          { type: 'input_audio', input_audio: { data: cleanBase64, format } },
        ],
      }],
      temperature: 0.1,
      maxTokens: 1000,
    });

    return new Response(
      JSON.stringify({ text: result.text.trim() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[ADMIN] 🚨 Voice-to-text catastrophic error:", error);
    const failure = gatewayErrorResponse(error);
    return new Response(
      JSON.stringify({ text: "", ...failure.body }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: failure.status }
    );
  }
});

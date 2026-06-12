import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ORIGIN') || 'https://jeenie.website',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ====================================================================
//  🔊 TEXT-TO-SPEECH v2.0 (Browser-based — no API needed)
//  Returns cleaned text + voice config for browser SpeechSynthesis.
//  Student NEVER sees errors.
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
        JSON.stringify({ success: false, error: 'Session expired' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const { text, voice } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({
          success: true,
          text: "Koi text nahi mila bhai!",
          voiceConfig: { lang: 'en-US', name: 'Default' },
          source: 'browser-tts',
          audioUrl: 'speech:en-US',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean text for speech
    const cleanText = text
      .replace(/<[^>]*>/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s?/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/\$[^$]+\$/g, 'formula')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .substring(0, 4000);

    const voiceConfig: Record<string, { lang: string; name: string }> = {
      'nova': { lang: 'en-US', name: 'Google US English' },
      'en-IN': { lang: 'en-IN', name: 'Google India English' },
      'hi-IN': { lang: 'hi-IN', name: 'Google Hindi' },
      'en-GB': { lang: 'en-GB', name: 'Google UK English' },
      'default': { lang: 'en-US', name: 'Google US English' },
    };

    const selectedVoice = voiceConfig[voice || 'nova'] || voiceConfig['default'];

    return new Response(
      JSON.stringify({
        success: true,
        text: cleanText,
        voiceConfig: selectedVoice,
        source: 'browser-tts',
        audioUrl: `speech:${selectedVoice.lang}`,
        audioContent: cleanText,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[ADMIN] 🚨 TTS error:", error);
    // Even on error, return something — student never sees error
    return new Response(
      JSON.stringify({
        success: true,
        text: "Speaker thoda shy hai aaj! Thoda baad mein try karo.",
        voiceConfig: { lang: 'en-US', name: 'Default' },
        source: 'browser-tts',
        audioUrl: 'speech:en-US',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ORIGIN') || 'https://jeenie.website',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Pehle login toh kar bhai! 🔑' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      throw new Error('Unauthorized');
    }

    const { subject, chapter, topic } = await req.json();

    // ✅ FIX: First get question IDs for this topic
    const { data: topicQuestions } = await supabase
      .from('questions')
      .select('id')
      .eq('subject', subject)
      .eq('chapter', chapter)
      .eq('topic', topic);

    if (!topicQuestions || topicQuestions.length === 0) {
      return new Response(
        JSON.stringify({ success: false, mastery: null, message: 'No questions found for this topic' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const questionIds = topicQuestions.map(q => q.id);

    // ✅ Now get attempts for those questions
    const { data: attempts } = await supabase
      .from('question_attempts')
      .select('is_correct, created_at')
      .eq('user_id', user.id)
      .in('question_id', questionIds)
      .order('created_at', { ascending: false });

    if (!attempts || attempts.length === 0) {
      return new Response(
        JSON.stringify({ success: false, mastery: null, message: 'No attempts found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate accuracy
    const correctAttempts = attempts.filter(a => a.is_correct).length;
    const accuracy = (correctAttempts / attempts.length) * 100;
    const questionsAttempted = attempts.length;

    // Determine mastery level
    let currentLevel = 1;
    if (accuracy >= 90 && questionsAttempted >= 60) currentLevel = 4;
    else if (accuracy >= 85 && questionsAttempted >= 40) currentLevel = 3;
    else if (accuracy >= 70 && questionsAttempted >= 25) currentLevel = 2;

    // Upsert mastery record
    const { error } = await supabase
      .from('topic_mastery')
      .upsert({
        user_id: user.id,
        subject,
        chapter,
        topic,
        current_level: currentLevel,
        accuracy: parseFloat(accuracy.toFixed(2)),
        questions_attempted: questionsAttempted,
        last_practiced: new Date().toISOString(),
        mastery_date: currentLevel === 4 ? new Date().toISOString() : null
      }, {
        onConflict: 'user_id,subject,chapter,topic'
      });

    if (error) throw error;

    return new Response(
      JSON.stringify({ 
        success: true,
        mastery: currentLevel,
        message: currentLevel === 4 ? '🎉 Topic Mastered!' : `Level ${currentLevel} achieved!`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ADMIN] 🚨 calculate-topic-mastery error:', error);
    return new Response(
      JSON.stringify({ error: 'Mastery calculator thoda confuse ho gaya! 🧠 Page refresh karke try karo.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});

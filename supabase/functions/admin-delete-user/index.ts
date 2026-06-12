import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Validate caller's auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not authenticated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the caller is an admin
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid session' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Check admin role server-side
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .in('role', ['admin', 'super_admin'])
      .maybeSingle()

    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    const { userId } = await req.json()
    if (!userId || typeof userId !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid user ID' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Prevent self-deletion
    if (userId === caller.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot delete your own account' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Delete related data first
    await supabase.from('question_attempts').delete().eq('user_id', userId)
    await supabase.from('test_attempts').delete().eq('user_id', userId)
    await supabase.from('test_sessions').delete().eq('user_id', userId)
    await supabase.from('points_log').delete().eq('user_id', userId)
    await supabase.from('topic_mastery').delete().eq('user_id', userId)
    await supabase.from('user_batch_subscriptions').delete().eq('user_id', userId)
    await supabase.from('daily_progress').delete().eq('user_id', userId)
    await supabase.from('study_plans').delete().eq('user_id', userId)
    await supabase.from('user_badges').delete().eq('user_id', userId)
    await supabase.from('user_notifications').delete().eq('user_id', userId)
    await supabase.from('push_subscriptions').delete().eq('user_id', userId)
    await supabase.from('referrals').delete().eq('referrer_id', userId)
    await supabase.from('conversion_prompts').delete().eq('user_id', userId)
    await supabase.from('question_reports').delete().eq('user_id', userId)
    await supabase.from('user_roles').delete().eq('user_id', userId)
    await supabase.from('profiles').delete().eq('id', userId)

    // Delete from auth using service role key
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('Auth deletion error:', deleteError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to delete auth user: ' + deleteError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('admin-delete-user error:', error?.message || error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ success: false, error: 'Not authenticated' }, 200)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user) return json({ success: false, error: 'Session expired' }, 200)

    // Verify caller is admin
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
    const isAdmin = (roles || []).some((r: any) => r.role === 'admin' || r.role === 'super_admin')
    if (!isAdmin) return json({ success: false, error: 'Admin access required' }, 200)

    const body = await req.json()
    const action: 'grant' | 'revoke' = body.action
    const targetUserId: string = body.userId
    if (!targetUserId || !['grant', 'revoke'].includes(action)) {
      return json({ success: false, error: 'Invalid request' }, 200)
    }

    if (action === 'revoke') {
      const { error } = await supabase.from('profiles').update({
        is_premium: false,
        subscription_tier: 'free',
        subscription_status: 'inactive',
        subscription_plan: null,
        subscription_end_date: null,
      }).eq('id', targetUserId)
      if (error) throw error
      return json({ success: true, message: 'Revoked' })
    }

    // grant
    const tier: 'pro' | 'pro_plus' = body.tier === 'pro_plus' ? 'pro_plus' : 'pro'
    const days = Math.max(1, Math.min(3650, Number(body.days) || 30))

    // Stack on existing expiry if still active
    const { data: existing } = await supabase
      .from('profiles')
      .select('subscription_end_date')
      .eq('id', targetUserId)
      .maybeSingle()

    let base = new Date()
    if (existing?.subscription_end_date) {
      const cur = new Date(existing.subscription_end_date)
      if (cur > base) base = cur
    }
    base.setDate(base.getDate() + days)

    const planId = tier === 'pro_plus'
      ? (days >= 365 ? 'pro_plus_yearly' : 'pro_plus_monthly')
      : (days >= 365 ? 'yearly' : 'monthly')

    const { error } = await supabase.from('profiles').update({
      is_premium: true,
      subscription_tier: tier,
      subscription_status: 'active',
      subscription_plan: planId,
      subscription_end_date: base.toISOString(),
    }).eq('id', targetUserId)
    if (error) throw error

    return json({
      success: true,
      tier,
      days,
      subscription_end_date: base.toISOString(),
    })
  } catch (e: any) {
    console.error('admin-grant-subscription error:', e?.message || e)
    return json({ success: false, error: e?.message || 'Server error' }, 200)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

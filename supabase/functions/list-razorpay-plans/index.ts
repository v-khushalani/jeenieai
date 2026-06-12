import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

interface RzpPlan {
  id: string
  item: { name: string; amount: number; currency: string }
  period: string
  interval: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ success: false, error: 'Login required' }, 200)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authError || !user) return json({ success: false, error: 'Session expired' }, 200)

    // Admin check
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin',
    })
    const { data: isSuper } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'super_admin',
    })
    if (!isAdmin && !isSuper) return json({ success: false, error: 'Admin only' }, 200)

    const KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')
    const KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')
    if (!KEY_ID || !KEY_SECRET) {
      return json({ success: false, error: 'Razorpay keys not configured' }, 200)
    }

    // Razorpay paginates; fetch up to 100 plans (sufficient for admin UI)
    const resp = await fetch('https://api.razorpay.com/v1/plans?count=100', {
      headers: {
        Authorization: `Basic ${btoa(`${KEY_ID}:${KEY_SECRET}`)}`,
      },
    })
    const body = await resp.json()
    if (!resp.ok) {
      return json({ success: false, error: body?.error?.description || 'Razorpay error' }, 200)
    }

    const plans = ((body.items || []) as RzpPlan[]).map((p) => ({
      id: p.id,
      name: p.item?.name || p.id,
      amount: p.item?.amount ?? 0,
      currency: p.item?.currency || 'INR',
      period: p.period,
      interval: p.interval,
    }))

    return json({ success: true, plans }, 200)
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 200)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

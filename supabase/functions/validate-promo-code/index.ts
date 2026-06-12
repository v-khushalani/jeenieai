import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Simple in-memory rate limit (best-effort; resets on cold start)
const hits = new Map<string, { count: number; ts: number }>()
function rateLimit(key: string, max = 10, windowMs = 60_000) {
  const now = Date.now()
  const rec = hits.get(key)
  if (!rec || now - rec.ts > windowMs) {
    hits.set(key, { count: 1, ts: now })
    return true
  }
  rec.count++
  return rec.count <= max
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ valid: false, reason: 'Login required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user) {
      return new Response(JSON.stringify({ valid: false, reason: 'Session expired' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    if (!rateLimit(user.id)) {
      return new Response(JSON.stringify({ valid: false, reason: 'Too many attempts. Try again in a minute.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    const { code, planId } = await req.json()
    if (typeof code !== 'string' || typeof planId !== 'string' || code.length === 0 || code.length > 64) {
      return new Response(JSON.stringify({ valid: false, reason: 'Invalid input' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    const { data, error } = await supabase.rpc('validate_promo_code', {
      p_code: code,
      p_plan_id: planId,
      p_user_id: user.id,
    })

    if (error) {
      console.error('validate_promo_code error', error)
      return new Response(JSON.stringify({ valid: false, reason: 'Validation failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    return new Response(JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  } catch (e) {
    console.error('validate-promo-code error', e)
    return new Response(JSON.stringify({ valid: false, reason: 'Server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  }
})

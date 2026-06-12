import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Please login to continue.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Session expired. Please login again.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const { planId, promoCode } = await req.json()
    if (typeof planId !== 'string' || planId.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid plan selected.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Load plan from DB (single source of truth)
    const { data: plan, error: planErr } = await supabase
      .from('subscription_plans')
      .select('id, name, price, duration_days, is_active')
      .eq('id', planId)
      .maybeSingle()

    if (planErr || !plan || !plan.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: 'Plan not available. Please refresh.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    let finalPriceRupees = Number(plan.price)
    let promoCodeId: string | null = null
    let discountApplied = 0

    // Apply promo code server-side (re-validate)
    if (promoCode && typeof promoCode === 'string' && promoCode.trim().length > 0) {
      const { data: promoRes, error: promoErr } = await supabase.rpc('validate_promo_code', {
        p_code: promoCode.trim(),
        p_plan_id: planId,
        p_user_id: user.id,
      })
      if (promoErr) {
        console.error('promo validation error', promoErr)
      } else if (promoRes && (promoRes as any).valid) {
        finalPriceRupees = Number((promoRes as any).final_price)
        discountApplied = Number((promoRes as any).discount_applied)
        promoCodeId = (promoRes as any).promo_code_id
      } else {
        return new Response(
          JSON.stringify({ success: false, error: (promoRes as any)?.reason || 'Invalid promo code' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }
    }

    const amountPaise = Math.round(finalPriceRupees * 100)
    const duration = plan.duration_days

    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')
    const RAZORPAY_MODE = (Deno.env.get('RAZORPAY_MODE') || 'live').toLowerCase()
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return new Response(
        JSON.stringify({ success: false, error: 'Payment system not configured. Please contact support.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }
    const isLiveKey = RAZORPAY_KEY_ID.startsWith('rzp_live_')
    const isTestKey = RAZORPAY_KEY_ID.startsWith('rzp_test_')
    console.log(`[create-razorpay-order] mode=${RAZORPAY_MODE} key_prefix=${RAZORPAY_KEY_ID.substring(0, 8)} isLive=${isLiveKey} isTest=${isTestKey}`)
    if (RAZORPAY_MODE === 'live' && !isLiveKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Payment gateway is in LIVE mode but TEST keys are configured. Admin must update RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to rzp_live_* values.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }
    if (RAZORPAY_MODE === 'test' && !isTestKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Payment gateway is in TEST mode but non-test keys are configured.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const orderData = {
      amount: amountPaise,
      currency: 'INR',
      receipt: `order_${Date.now()}`,
      notes: {
        userId: user.id,
        planId,
        promoCodeId: promoCodeId || '',
      },
    }

    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
      },
      body: JSON.stringify(orderData),
    })

    if (!razorpayResponse.ok) {
      const error = await razorpayResponse.text()
      throw new Error(`Razorpay API error: ${error}`)
    }

    const razorpayOrder = await razorpayResponse.json()

    await supabase.from('payments').insert({
      user_id: user.id,
      razorpay_order_id: razorpayOrder.id,
      amount: amountPaise,
      currency: 'INR',
      status: 'created',
      plan_id: planId,
      plan_duration: duration,
      metadata: {
        promo_code_id: promoCodeId,
        discount_applied: discountApplied,
        original_price: Number(plan.price),
      },
    })

    return new Response(
      JSON.stringify({
        success: true,
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        finalPrice: finalPriceRupees,
        discountApplied,
        keyId: RAZORPAY_KEY_ID,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('create-razorpay-order error:', error?.message || error)
    return new Response(
      JSON.stringify({ success: false, error: 'Payment system is temporarily unavailable. Please try again in a moment.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})

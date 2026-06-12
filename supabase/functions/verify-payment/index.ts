import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const REFERRAL_REWARD_DAYS = 30

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
        JSON.stringify({ success: false, error: 'Session expired.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = await req.json()

    // Load plan from DB
    const { data: plan, error: planErr } = await supabase
      .from('subscription_plans')
      .select('id, name, tier, duration_days')
      .eq('id', planId)
      .maybeSingle()

    if (planErr || !plan) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid plan.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')
    if (!RAZORPAY_KEY_SECRET) throw new Error('Secret not configured')

    const generatedSignature = createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex')

    if (generatedSignature !== razorpay_signature) {
      throw new Error('Invalid payment signature')
    }

    const { data: paymentOrder, error: orderError } = await supabase
      .from('payments')
      .select('id, user_id, amount, plan_id, plan_duration, metadata, status, razorpay_payment_id')
      .eq('razorpay_order_id', razorpay_order_id)
      .single()

    if (orderError || !paymentOrder) throw new Error('Payment order not found')

    if (paymentOrder.user_id !== user.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Payment ownership mismatch.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Idempotency: if this order is already marked paid, do NOT re-extend the
    // subscription end date or re-credit the user. Just return success so the
    // client (which may retry on flaky networks) sees the same outcome.
    if (paymentOrder.status === 'paid' && paymentOrder.razorpay_payment_id) {
      return new Response(
        JSON.stringify({ success: true, alreadyProcessed: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }


    const duration = plan.duration_days
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + duration)

    await supabase.from('payments').update({
      razorpay_payment_id,
      razorpay_signature,
      status: 'paid',
    }).eq('razorpay_order_id', razorpay_order_id)

    await supabase.from('profiles').update({
      subscription_end_date: endDate.toISOString(),
      is_premium: true,
      subscription_tier: plan.tier, // 'pro' | 'pro_plus' — single source of truth
      subscription_plan: plan.id,
      subscription_status: 'active',
    }).eq('id', user.id)


    // Record promo redemption if any
    try {
      const promoCodeId = (paymentOrder.metadata as any)?.promo_code_id as string | null
      const discountApplied = (paymentOrder.metadata as any)?.discount_applied as number | undefined
      if (promoCodeId) {
        await supabase.from('promo_redemptions').insert({
          promo_code_id: promoCodeId,
          user_id: user.id,
          payment_id: paymentOrder.id,
          plan_id: planId,
          discount_applied: discountApplied ?? 0,
        })
        // Atomic increment via SQL
        await supabase.rpc('increment_promo_redemption', { p_promo_id: promoCodeId }).then(
          () => {},
          async () => {
            // Fallback if RPC doesn't exist: best-effort update
            const { data: pc } = await supabase.from('promo_codes').select('current_redemptions').eq('id', promoCodeId).single()
            if (pc) {
              await supabase.from('promo_codes').update({ current_redemptions: (pc.current_redemptions || 0) + 1 }).eq('id', promoCodeId)
            }
          }
        )
      }
    } catch (e) {
      console.error('promo redemption record error (non-fatal)', e)
    }

    // ============================================================
    // REFERRAL REWARD
    // ============================================================
    try {
      const { data: pendingRef } = await supabase
        .from('referrals')
        .select('id, referrer_id, status, reward_granted')
        .eq('referred_id', user.id)
        .eq('reward_granted', false)
        .maybeSingle()

      if (pendingRef?.referrer_id) {
        const referrerId = pendingRef.referrer_id as string
        const tier = plan.tier
        const rewardPlanId = tier === 'pro_plus' ? 'pro_plus_monthly' : 'monthly'

        const { data: refProfile } = await supabase
          .from('profiles')
          .select('subscription_end_date, subscription_tier')
          .eq('id', referrerId)
          .single()

        let newEnd = new Date()
        if (refProfile?.subscription_end_date && new Date(refProfile.subscription_end_date) > newEnd) {
          newEnd = new Date(refProfile.subscription_end_date)
        }
        newEnd.setDate(newEnd.getDate() + REFERRAL_REWARD_DAYS)

        // Never downgrade tier (pro_plus > pro > free)
        const currentTier = refProfile?.subscription_tier || 'free'
        const tierRank: Record<string, number> = { free: 0, pro: 1, pro_plus: 2 }
        const resolvedTier = tierRank[tier] > tierRank[currentTier] ? tier : currentTier

        await supabase.from('profiles').update({
          is_premium: true,
          subscription_end_date: newEnd.toISOString(),
          subscription_tier: resolvedTier,
          subscription_status: 'active',
        }).eq('id', referrerId)


        await supabase.from('payments').insert({
          user_id: referrerId,
          razorpay_order_id: `referral_${pendingRef.id}`,
          razorpay_payment_id: `referral_${pendingRef.id}`,
          razorpay_signature: 'referral_reward',
          amount: 0,
          currency: 'INR',
          plan_id: rewardPlanId,
          plan_duration: REFERRAL_REWARD_DAYS,
          status: 'paid',
          metadata: { source: 'referral_reward', tier, referred_user: user.id },
        })

        await supabase.from('referrals').update({
          status: tier === 'pro_plus' ? 'completed_pro_plus' : 'completed_pro',
          reward_granted: true,
        }).eq('id', pendingRef.id)

        await supabase.from('user_notifications').insert({
          user_id: referrerId,
          title: '🎉 Referral Reward Unlocked!',
          message: `Tera dost ne ${plan.name} liya — tujhe 30 din ${plan.name} FREE mil gaya! Keep referring!`,
        }).then(() => {}, () => {})
      }
    } catch (refErr) {
      console.error('[verify-payment] Referral grant error (non-fatal):', refErr)
    }

    return new Response(
      JSON.stringify({ success: true, subscription_end_date: endDate.toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('verify-payment error:', error?.message || error)
    return new Response(
      JSON.stringify({ success: false, error: 'Payment verification failed. Your payment is safe — please try again or contact support.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})

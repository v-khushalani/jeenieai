import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ORIGIN') || 'https://jeenie.website',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Extract and validate authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Please login to continue.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Session expired. Please login again.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Get and validate request body
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, batchId } = await req.json()
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !batchId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Payment details are incomplete. Please try again.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')
    if (!RAZORPAY_KEY_SECRET) throw new Error('Secret not configured')

    // Verify payment signature
    const generatedSignature = createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex')

    if (generatedSignature !== razorpay_signature) {
      throw new Error('Invalid payment signature')
    }

    // Verify the payment order exists in the 'payments' table
    const { data: paymentOrder, error: orderError } = await supabase
      .from('payments')
      .select('user_id, amount, batch_id, plan_duration')
      .eq('razorpay_order_id', razorpay_order_id)
      .single()

    if (orderError || !paymentOrder) {
      throw new Error('Payment order not found')
    }

    // Verify user owns this payment
    if (paymentOrder.user_id !== user.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Payment ownership mismatch. Please contact support.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Verify batch ID matches
    if (paymentOrder.batch_id !== batchId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Batch details mismatch. Please refresh the page.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Fetch batch to get validity days (from server, not from payment record)
    const { data: batch, error: batchError } = await supabase
      .from('batches')
      .select('id, price, offer_price, validity_days')
      .eq('id', batchId)
      .single()

    if (batchError || !batch) {
      throw new Error('Batch not found')
    }

    // Calculate expiry date using batch's server-controlled validity
    const validityDays = batch.validity_days || 365
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + validityDays)

    // Update payment record to 'paid'
    await supabase.from('payments').update({
      razorpay_payment_id,
      razorpay_signature,
      status: 'paid'
    }).eq('razorpay_order_id', razorpay_order_id)

    // Create or update user_batch_subscriptions
    const { data: existingSub } = await supabase
      .from('user_batch_subscriptions')
      .select('id, expires_at')
      .eq('user_id', user.id)
      .eq('batch_id', batchId)
      .single()

    if (existingSub) {
      // Extend existing subscription
      const currentExpiry = new Date(existingSub.expires_at)
      const newExpiry = currentExpiry > new Date() ? currentExpiry : new Date()
      newExpiry.setDate(newExpiry.getDate() + validityDays)

      await supabase
        .from('user_batch_subscriptions')
        .update({
          status: 'active',
          expires_at: newExpiry.toISOString(),
          purchased_at: new Date().toISOString(),
          amount_paid: paymentOrder.amount,
          payment_id: razorpay_payment_id
        })
        .eq('id', existingSub.id)
    } else {
      // Create new subscription
      await supabase
        .from('user_batch_subscriptions')
        .insert({
          user_id: user.id,
          batch_id: batchId,
          status: 'active',
          purchased_at: new Date().toISOString(),
          expires_at: endDate.toISOString(),
          amount_paid: paymentOrder.amount,
          payment_id: razorpay_payment_id
        })
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        expires_at: endDate.toISOString(),
        message: 'Batch access granted successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('sync-batch-payment error:', error?.message || error)
    return new Response(
      JSON.stringify({ success: false, error: 'Payment sync failed. Your payment is safe — please contact support if the issue persists.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
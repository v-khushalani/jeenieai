import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const { batchId } = await req.json()
    
    if (!batchId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Please select a batch first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Fetch batch details from database (server-controlled pricing)
    const { data: batch, error: batchError } = await supabase
      .from('batches')
      .select('id, name, price, offer_price, validity_days')
      .eq('id', batchId)
      .single()

    if (batchError || !batch) {
      return new Response(
        JSON.stringify({ success: false, error: 'Batch not found. Please refresh the page.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Use offer_price if available, otherwise use regular price
    const effectivePrice = batch.offer_price && batch.offer_price > 0 ? batch.offer_price : batch.price;

    if (!effectivePrice || effectivePrice <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'This batch is not available for purchase right now.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials not configured')
    }

    // Check if user already has active subscription to this batch
    const { data: existingSub } = await supabase
      .from('user_batch_subscriptions')
      .select('id, expires_at')
      .eq('user_id', user.id)
      .eq('batch_id', batchId)
      .eq('status', 'active')
      .single()

    if (existingSub && existingSub.expires_at && new Date(existingSub.expires_at) > new Date()) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'You already have an active subscription to this batch.',
          expiresAt: existingSub.expires_at
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Batch price in DB is stored in RUPEES. Convert to paise for Razorpay.
    const amountInPaise = Math.round(effectivePrice * 100);

    const orderData = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `batch_${batchId}_${Date.now()}`,
      notes: { 
        userId: user.id, 
        batchId: batchId,
        batch_name: batch.name,
        expected_amount: amountInPaise,
        expected_validity_days: batch.validity_days
      }
    }

    const authHeaderRazorpay = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)

    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authHeaderRazorpay}`
      },
      body: JSON.stringify(orderData)
    })

    if (!razorpayResponse.ok) {
      const error = await razorpayResponse.text()
      throw new Error(`Razorpay API error: ${error}`)
    }

    const razorpayOrder = await razorpayResponse.json()

    // Store payment record in the existing 'payments' table
    await supabase.from('payments').insert({
      user_id: user.id,
      batch_id: batchId,
      razorpay_order_id: razorpayOrder.id,
      amount: effectivePrice, // Store in rupees to match payments table convention
      currency: 'INR',
      status: 'created',
      plan_duration: batch.validity_days,
      metadata: {
        type: 'batch_purchase',
        batch_name: batch.name,
        original_price: batch.price,
        offer_price: batch.offer_price
      }
    })

    return new Response(
      JSON.stringify({
        success: true,
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        batch: {
          id: batch.id,
          name: batch.name,
          validity_days: batch.validity_days
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('create-batch-order error:', error?.message || error)
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to create batch order. Please try again.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
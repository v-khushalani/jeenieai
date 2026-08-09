import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Web Push using fetch + Web Crypto (Deno-native, no npm dependency)
async function importKey(pem: string, isPrivate: boolean) {
  const b64 = pem.replace(/-+(BEGIN|END)[^-]+-+/g, '').replace(/\s/g, '');
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  if (!isPrivate) {
    return crypto.subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, true, []);
  }
  return crypto.subtle.importKey('pkcs8', raw, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function uint8ArrayToUrlBase64(arr: Uint8Array): string {
  let binary = '';
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateVapidAuth(endpoint: string, vapidPublicKey: string, vapidPrivateKey: string) {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  // JWT header + payload
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: 'mailto:support@jeenie.website' };

  const encHeader = uint8ArrayToUrlBase64(new TextEncoder().encode(JSON.stringify(header)));
  const encPayload = uint8ArrayToUrlBase64(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${encHeader}.${encPayload}`;

  // Import private key and sign
  const privKeyBytes = urlBase64ToUint8Array(vapidPrivateKey);
  const key = await crypto.subtle.importKey(
    'raw',
    privKeyBytes.buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  ).catch(async () => {
    // Try PKCS8 format
    const pkcs8 = privKeyBytes;
    return crypto.subtle.importKey('pkcs8', pkcs8.buffer as ArrayBuffer, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  });

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw r||s format if needed
  const sigBytes = new Uint8Array(sig);
  let rawSig: Uint8Array;
  if (sigBytes.length === 64) {
    rawSig = sigBytes;
  } else {
    // DER to raw
    const r = sigBytes.slice(4, 4 + sigBytes[3]);
    const sOffset = 4 + sigBytes[3] + 2;
    const s = sigBytes.slice(sOffset, sOffset + sigBytes[sOffset - 1]);
    rawSig = new Uint8Array(64);
    rawSig.set(r.length <= 32 ? r : r.slice(r.length - 32), 32 - Math.min(r.length, 32));
    rawSig.set(s.length <= 32 ? s : s.slice(s.length - 32), 64 - Math.min(s.length, 32));
  }

  const token = `${unsignedToken}.${uint8ArrayToUrlBase64(rawSig)}`;
  return { authorization: `vapid t=${token}, k=${vapidPublicKey}` };
}

async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<void> {
  // Encrypt payload using Web Crypto (simplified - send without encryption for basic support)
  const { authorization } = await generateVapidAuth(subscription.endpoint, vapidPublicKey, vapidPrivateKey);

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authorization,
      'TTL': '86400',
      'Content-Length': '0',
      'Urgency': 'normal',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err: any = new Error(`Push failed: ${res.status} ${body}`);
    err.statusCode = res.status;
    err.body = body;
    throw err;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify caller is admin
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check admin role
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'super_admin']);

    if (!roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { title, message, user_ids } = await req.json();

    if (!title || !message) {
      return new Response(
        JSON.stringify({ error: 'Title and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured');
      return new Response(
        JSON.stringify({ error: 'VAPID keys not configured', sent: 0, failed: 0 }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // VAPID keys ready for per-request auth generation

    // Get target subscriptions
    let query = supabaseAdmin.from('push_subscriptions').select('*');
    if (user_ids && user_ids.length > 0) {
      query = query.in('user_id', user_ids);
    }

    const { data: subscriptions, error: subError } = await query;

    if (subError) {
      throw new Error(`Failed to fetch subscriptions: ${subError.message}`);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, failed: 0, message: 'No push subscriptions found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = JSON.stringify({
      title,
      body: message,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: '/dashboard' },
    });

    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    for (const sub of subscriptions) {
      try {
        await sendWebPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          vapidPublicKey,
          vapidPrivateKey
        );
        sent++;
        console.log(`✅ Push sent to user ${sub.user_id}`);
      } catch (err: any) {
        console.error(`❌ Push failed for ${sub.user_id}:`, err.statusCode, err.body);
        if (err.statusCode === 404 || err.statusCode === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
        failed++;
      }
    }

    // Cleanup expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expiredEndpoints);
      console.log(`🧹 Cleaned up ${expiredEndpoints.length} expired subscriptions`);
    }

    console.log(`📊 Push results: ${sent} sent, ${failed} failed, ${subscriptions.length} total`);

    return new Response(
      JSON.stringify({ success: true, sent, failed, total: subscriptions.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Send push error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

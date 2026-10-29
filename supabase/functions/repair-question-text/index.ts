// One-off maintenance: repairs mojibake (wrongly decoded characters) in the question bank.
// Only verified administrators may invoke maintenance.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

import { requireAdmin } from '../_shared/require-admin.ts';

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = await requireAdmin(req);
  if (!admin) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let total = 0;
  let rounds = 0;
  const startedAt = Date.now();

  while (rounds < 400 && Date.now() - startedAt < 110_000) {
    const { data, error } = await admin.rpc("repair_mojibake_batch", { p_limit: 40 });
    if (error) {
      return new Response(JSON.stringify({ error: 'Repair failed', repaired: total, rounds }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const n = Number(data ?? 0);
    total += n;
    rounds += 1;
    if (n === 0) break;
  }

  return new Response(JSON.stringify({ ok: true, repaired: total, rounds }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

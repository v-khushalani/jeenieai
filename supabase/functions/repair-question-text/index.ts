// One-off maintenance: repairs mojibake (wrongly decoded characters) in the question bank.
// Hardened by a fixed setup token. Safe to re-run; stops when nothing is left to fix.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SETUP_TOKEN = "qa-repair-text-2026-jeenie";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.headers.get("x-setup-token") !== SETUP_TOKEN) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let total = 0;
  let rounds = 0;
  const startedAt = Date.now();

  while (rounds < 400 && Date.now() - startedAt < 110_000) {
    const { data, error } = await admin.rpc("repair_mojibake_batch", { p_limit: 40 });
    if (error) {
      return new Response(JSON.stringify({ error: error.message, repaired: total, rounds }), {
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

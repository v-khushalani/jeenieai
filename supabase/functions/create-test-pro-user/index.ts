// Admin-only helper to create / refresh a Pro test user for QA.
// Caller must be an authenticated admin or super_admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // QA helper: idempotent and intentionally callable without a user JWT.
    // Creates / refreshes a single Pro test account for end-to-end QA.
    // Hardened by a fixed setup token; rotate or delete the function once QA is complete.
    const SETUP_TOKEN = "qa-pro-setup-2026-jeenie";
    const setupHeader = req.headers.get("x-setup-token") || "";
    if (setupHeader !== SETUP_TOKEN) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(url, serviceKey);
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || `pro-test-${Date.now()}@jeenieapp.test`).toLowerCase();
    const password = String(body.password || `Pro!${crypto.randomUUID().slice(0, 10)}`);
    const targetExam = String(body.target_exam || "JEE_MAINS");

    // Create user (idempotent: if exists, fetch and reuse)
    let userId: string | null = null;
    const created = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: "Pro Tester", role: "qa" },
    });
    if (created.error) {
      // try lookup if duplicate
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = list.users.find((u) => u.email?.toLowerCase() === email);
      if (!existing) {
        return new Response(JSON.stringify({ error: created.error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = existing.id;
      // reset password so caller can log in
      await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    } else {
      userId = created.data.user!.id;
    }

    // Profile: mark premium for 1 year, set exam/grade
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("profiles").upsert({
      id: userId, email, full_name: "Pro Tester",
      is_premium: true,
      subscription_tier: "pro",
      subscription_status: "active",
      subscription_plan: "pro",
      subscription_end_date: expiresAt,
      target_exam: targetExam, grade: 12, daily_question_limit: 9999,
      goal_locked: true, goal_locked_at: new Date().toISOString(),
    }, { onConflict: "id" });

    // Student role
    await admin.from("user_roles").upsert({ user_id: userId, role: "student" }, { onConflict: "user_id,role" });

    // Subscribe to every active batch for full content access during QA
    const { data: batches } = await admin.from("batches").select("id").eq("is_active", true);
    if (batches?.length) {
      const rows = batches.map((b) => ({
        user_id: userId!,
        batch_id: b.id,
        status: "active",
        starts_at: new Date().toISOString(),
        expires_at: expiresAt,
      }));
      // Best-effort: ignore duplicate conflicts
      for (const r of rows) {
        await admin.from("user_batch_subscriptions").upsert(r, { onConflict: "user_id,batch_id" });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        credentials: { email, password },
        user_id: userId,
        batches_subscribed: batches?.length || 0,
        expires_at: expiresAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Admin-only QA helper: seeds 5 test users (student, student_pro, student_pro_plus, admin, educator).
// Hardened by a fixed setup token. Idempotent: re-running refreshes passwords and entitlements.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SETUP_TOKEN = "qa-seed-users-2026-jeenie";

type Role = "student" | "admin" | "educator" | "super_admin";

interface Spec {
  key: string;
  email: string;
  password: string;
  fullName: string;
  role: Role;
  premium?: boolean;
  tier?: "pro" | "pro_plus";
}

const SPECS: Spec[] = [
  { key: "student",          email: "qa.student@jeenieapp.test",       password: "Student!Pass2026",   fullName: "QA Student",          role: "student" },
  { key: "student_pro",      email: "qa.pro@jeenieapp.test",           password: "Pro!Pass2026",       fullName: "QA Pro Student",      role: "student", premium: true, tier: "pro" },
  { key: "student_pro_plus", email: "qa.proplus@jeenieapp.test",       password: "ProPlus!Pass2026",   fullName: "QA Pro+ Student",     role: "student", premium: true, tier: "pro_plus" },
  { key: "admin",            email: "qa.admin@jeenieapp.test",         password: "Admin!Pass2026",     fullName: "QA Admin",            role: "super_admin" },
  { key: "educator",         email: "qa.educator@jeenieapp.test",      password: "Educator!Pass2026",  fullName: "QA Educator",         role: "educator" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.headers.get("x-setup-token") !== SETUP_TOKEN) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const results: Record<string, unknown> = {};

    // Cache existing users (single list call)
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });

    for (const spec of SPECS) {
      let userId: string | null = null;
      const existing = list?.users.find((u) => u.email?.toLowerCase() === spec.email);

      if (existing) {
        userId = existing.id;
        await admin.auth.admin.updateUserById(existing.id, {
          password: spec.password,
          email_confirm: true,
          user_metadata: { full_name: spec.fullName, role: spec.key },
        });
      } else {
        const { data: created, error } = await admin.auth.admin.createUser({
          email: spec.email,
          password: spec.password,
          email_confirm: true,
          user_metadata: { full_name: spec.fullName, role: spec.key },
        });
        if (error || !created.user) {
          results[spec.key] = { error: error?.message || "create failed" };
          continue;
        }
        userId = created.user.id;
      }

      // Profile upsert
      await admin.from("profiles").upsert({
        id: userId,
        email: spec.email,
        full_name: spec.fullName,
        is_premium: !!spec.premium,
        subscription_tier: spec.premium ? (spec.tier || "pro") : "free",
        subscription_end_date: spec.premium ? expiresAt : null,
        subscription_plan: spec.tier || null,
        subscription_status: spec.premium ? "active" : null,
        target_exam: "JEE_MAINS",
        grade: 12,
        daily_question_limit: spec.premium ? 9999 : 100,
        goal_locked: true,
        onboarding_completed: true,
      }, { onConflict: "id" });

      // Role — remove any other roles first so user has exactly the intended one
      await admin.from("user_roles").delete().eq("user_id", userId).neq("role", spec.role);
      await admin.from("user_roles").upsert(
        { user_id: userId, role: spec.role },
        { onConflict: "user_id,role" }
      );

      // Pro / Pro+ get all batch subscriptions for content access
      if (spec.premium) {
        const { data: batches } = await admin.from("batches").select("id").eq("is_active", true);
        if (batches?.length) {
          for (const b of batches) {
            await admin.from("user_batch_subscriptions").upsert({
              user_id: userId,
              batch_id: b.id,
              status: "active",
              starts_at: new Date().toISOString(),
              expires_at: expiresAt,
            }, { onConflict: "user_id,batch_id" });
          }
        }
      }

      results[spec.key] = {
        user_id: userId,
        email: spec.email,
        password: spec.password,
        role: spec.role,
        premium: !!spec.premium,
        tier: spec.tier || null,
      };
    }

    return new Response(JSON.stringify({ ok: true, users: results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

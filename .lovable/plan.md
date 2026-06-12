# JEEnie — Pre-Launch Audit

Short answer: **No — not launch-ready yet.** App code is in good shape, but there are **2 critical (data-leak) security issues** and **missing backend secrets** that block a safe launch. Everything else is "should-fix" polish.

---

## 🔴 BLOCKERS (must fix before launch)

### 1. `profiles` table is publicly readable
SELECT policy is `USING (true)` → **anyone, unauthenticated, can read every user's email, phone, full name, avatar, subscription status**. Sample scan confirmed real PII is exposed.
→ Restrict SELECT to `auth.uid() = id`; expose only safe fields (display name, avatar) via a dedicated public view if needed.

### 2. `referrals.referred_email` leaks third-party emails
Referrer can read every referred email, even for people who never signed up → email enumeration.
→ Either drop the `referred_email` column or hide it via a column-restricted view / RLS column filter.

### 3. Missing runtime secrets
Only `LOVABLE_API_KEY` is configured. Edge functions reference but don't have:
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` → payments (`create-razorpay-order`, `verify-payment`, `create-batch-order`) will fail
- `GEMINI_API_KEY` / `OPENAI_API_KEY` → AI features (`jeenie`, `generate-study-plan`, `extract-pdf-questions`, `text-to-speech`, `voice-to-text`) will fail
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` → push notifications will fail

Without these, paid signup and core "AI tutor" features are broken on day 1.

---

## 🟡 SHOULD-FIX (security warnings, non-blocking but recommended)

| # | Issue | Risk |
|---|---|---|
| 4 | `admin_notifications` in Realtime publication, no non-admin SELECT policy | Realtime may broadcast admin content to all subscribers |
| 5 | `promo_codes` in Realtime publication without restrictive policy | Discount codes could leak to subscribers |
| 6 | `realtime.messages` has no RLS | Any signed-in user can subscribe to any channel (battle sessions, private notifications) |
| 7 | `topic_mastery` has SELECT but no INSERT/UPDATE/DELETE policies | Confirm all writes go via service-role function |
| 8 | `battle_rewards` has no write policies | Same — confirm server-only writes |
| 9 | A SECURITY DEFINER view exists (linter ERROR) | Should be SECURITY INVOKER or moved out of public schema |
| 10 | Multiple SECURITY DEFINER functions executable by `anon` / `authenticated` | Revoke EXECUTE where not intended |
| 11 | Extensions installed in `public` schema | Move to `extensions` schema |
| 12 | RLS enabled but no policy on some tables (INFO) | Add policies or disable RLS |
| 13 | Auth "leaked password protection" disabled | Enable in Supabase Auth settings |

---

## 🟢 LOOKS GOOD

- Supabase connected, types generated, 24 edge functions deployed
- Razorpay payment flow has signature verification + idempotency + referral rewards
- Promo redemption is server-validated via edge function + RPC
- CSP, HSTS, X-Frame-Options, security headers configured in `vercel.json`
- PWA + service worker registered, auto-update on
- Sentry + Mixpanel + GA hooks present (need IDs in env)
- Admin role check uses `user_roles` table + `has_role` SECURITY DEFINER (correct pattern)

---

## 📋 Proposed fix plan (in order)

1. **Migration** — fix `profiles` SELECT policy + remove/hide `referrals.referred_email`.
2. **Migration** — tighten Realtime: remove `admin_notifications` & `promo_codes` from `supabase_realtime` publication (or add restrictive policies); add RLS on `realtime.messages` scoping subscriptions by `auth.uid()`.
3. **Migration** — add explicit write policies on `topic_mastery` and `battle_rewards` (or document service-role-only).
4. **Migration** — audit SECURITY DEFINER functions/views: revoke EXECUTE from `anon`/`authenticated` where unintended; convert the flagged view to SECURITY INVOKER; move public-schema extensions to `extensions`.
5. **Secrets** — add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `GEMINI_API_KEY` (and/or `OPENAI_API_KEY`), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` via the secrets tool.
6. **Supabase dashboard (manual)** — enable Leaked Password Protection, confirm Site URL + Redirect URLs include the production domain, confirm Google OAuth credentials are set.
7. **Re-run security scan** → publish.

---

## ❓ Decisions I need from you before implementing

1. For **#2 referrals**: drop the `referred_email` column entirely, or keep it but block client reads (server-only)?
2. For **#3 secrets**: do you already have Razorpay live keys + a Gemini/OpenAI key ready to paste? Which AI provider — Gemini, OpenAI, or both?
3. Want me to also enable Leaked Password Protection automatically (where possible) and tighten the SECURITY DEFINER grants in the same migration, or keep that as a separate review step?

Approve and I'll execute the migrations + request the secrets one by one.

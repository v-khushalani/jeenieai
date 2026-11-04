# Complete public function permission inventory

Captured via read-only PostgreSQL catalog queries on 2026-11-03; no row data or secrets.

| Signature | Return | Anonymous | Authenticated | Owner | Disposition |
|---|---|---|---|---|---|
| `admin_get_profiles_by_ids(uuid[])` | TABLE(id uuid, full_name text, email text) | True | True | postgres | Unchanged; no direct answer payload found |
| `admin_list_profiles()` | TABLE(id uuid, email text, full_name text, phone text, created_at timestamp with time zone, grade integer, target_exam text, is_premium boolean, subscription_end_date timestamp with time zone, subscription_tier text, subscription_status text, subscription_plan text, educator_approved boolean) | True | True | postgres | Unchanged; no direct answer payload found |
| `apply_paid_subscription(text,text,text,uuid,text,text,timestamp with time zone)` | void | False | False | postgres | Unchanged; no direct answer payload found |
| `assign_referral_code_on_insert()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `award_badge(uuid,uuid)` | uuid | False | False | postgres | Unchanged; no direct answer payload found |
| `award_mission_points(uuid,text)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `award_xp(boolean,integer,integer)` | jsonb | True | True | postgres | Unchanged; no direct answer payload found |
| `backfill_text_quality(integer)` | integer | True | True | postgres | Unchanged; no direct answer payload found |
| `bump_mission_block_progress(uuid,text,boolean,uuid)` | jsonb | True | True | postgres | Unchanged; no direct answer payload found |
| `bump_mission_progress_by_chapter(uuid,boolean,uuid)` | jsonb | True | True | postgres | Unchanged; no direct answer payload found |
| `cancel_subscription()` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `change_user_goal(uuid,text,integer,text,boolean)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `chapters_legacy_sync()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `chapters_propagate_class_level()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `check_and_award_badges(uuid)` | TABLE(badge_id uuid, code text, name text) | True | True | postgres | Unchanged; no direct answer payload found |
| `check_and_reset_streak(uuid)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `claim_daily_vault()` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `classify_question_text(text)` | text | True | True | postgres | Unchanged; no direct answer payload found |
| `classify_questions_batch(integer)` | jsonb | False | False | postgres | Unchanged; no direct answer payload found |
| `cleanup_expired_subscriptions()` | void | False | False | postgres | Unchanged; no direct answer payload found |
| `close_league_cycle()` | jsonb | False | False | postgres | Unchanged; no direct answer payload found |
| `community_accept_reply(uuid)` | jsonb | True | True | postgres | Unchanged; no direct answer payload found |
| `community_apply_report()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `community_bump_reply_count()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `community_get_authors(uuid[])` | TABLE(id uuid, full_name text, avatar_url text) | True | True | postgres | Unchanged; no direct answer payload found |
| `community_toggle_vote(uuid,uuid)` | jsonb | True | True | postgres | Unchanged; no direct answer payload found |
| `count_unseen_questions(uuid,text,text,uuid,uuid)` | integer | True | True | postgres | Unchanged; no direct answer payload found |
| `create_referral(text)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `current_cycle_start()` | date | True | True | postgres | Unchanged; no direct answer payload found |
| `delete_duplicate_questions()` | jsonb | False | False | postgres | Unchanged; no direct answer payload found |
| `enforce_question_integrity()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `ensure_daily_progress(uuid,integer)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `ensure_policy(text,text,text)` | void | False | False | postgres | Unchanged; no direct answer payload found |
| `exam_family(text)` | text[] | True | True | postgres | Unchanged; no direct answer payload found |
| `exam_pool(text,text)` | text[] | True | True | postgres | Unchanged; no direct answer payload found |
| `fetch_unseen_questions(uuid,text,text,uuid,uuid,text,uuid[],integer)` | SETOF questions | False | True | postgres | Answer-returning oracle: revoke PUBLIC/anon/authenticated; service only |
| `finish_battle(uuid)` | jsonb | False | True | postgres | Lifecycle: private legacy + authenticated guarded wrapper |
| `fix_chapter_batch_distribution()` | jsonb | False | False | postgres | Unchanged; no direct answer payload found |
| `fix_mojibake(text)` | text | True | True | postgres | Unchanged; no direct answer payload found |
| `fn_auto_deactivate_on_report()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `fn_expire_batch_subscriptions()` | void | False | False | postgres | Unchanged; no direct answer payload found |
| `fn_log_payment_status_change()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `fn_record_question_edit()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `fn_update_last_activity()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `generate_referral_code()` | text | False | True | postgres | Unchanged; no direct answer payload found |
| `get_all_subject_question_counts(uuid[],text,integer)` | TABLE(subject text, question_count bigint, chapter_count bigint) | True | True | postgres | Unchanged; no direct answer payload found |
| `get_chapter_difficulty_distribution(uuid)` | TABLE(difficulty text, count bigint) | True | True | postgres | Unchanged; no direct answer payload found |
| `get_chapter_question_counts(text,uuid[],text)` | TABLE(chapter_id uuid, count bigint) | False | True | postgres | Unchanged; no direct answer payload found |
| `get_chapter_question_counts(uuid[],text)` | TABLE(chapter_id uuid, count bigint) | True | True | postgres | Unchanged; no direct answer payload found |
| `get_contract_status()` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `get_leaderboard_with_stats(integer)` | TABLE(id uuid, full_name text, avatar_url text, total_points integer, current_streak integer, total_questions bigint, accuracy numeric) | True | True | postgres | Unchanged; no direct answer payload found |
| `get_my_league()` | TABLE(league_id uuid, tier text, cycle_start date, cycle_end date, user_id uuid, full_name text, avatar_url text, xp integer, rank bigint, is_me boolean) | True | True | postgres | Unchanged; no direct answer payload found |
| `get_questions_for_remap(integer)` | TABLE(id uuid, question_text text, subject text, chapter_id uuid) | False | False | postgres | Unchanged; no direct answer payload found |
| `get_subject_question_counts(uuid[],text)` | TABLE(subject text, count bigint) | False | True | postgres | Unchanged; no direct answer payload found |
| `get_system_health_status()` | jsonb | True | True | postgres | Unchanged; no direct answer payload found |
| `get_topic_question_counts(uuid)` | TABLE(topic_id uuid, count bigint) | False | True | postgres | Unchanged; no direct answer payload found |
| `get_topic_question_counts(uuid,uuid[],text)` | TABLE(topic_id uuid, count bigint) | True | True | postgres | Unchanged; no direct answer payload found |
| `get_xp_status()` | jsonb | True | True | postgres | Unchanged; no direct answer payload found |
| `guard_referral_update()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `handle_new_educator_signup_notification()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `handle_new_user()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `handle_profile_deleted()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `handle_question_report_hide()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `has_role(uuid,app_role)` | boolean | False | True | postgres | Unchanged; no direct answer payload found |
| `increment_promo_redemption(uuid)` | void | False | False | postgres | Unchanged; no direct answer payload found |
| `is_active_pro_plus(uuid)` | boolean | False | True | postgres | Unchanged; no direct answer payload found |
| `join_current_league()` | uuid | True | True | postgres | Unchanged; no direct answer payload found |
| `log_points(uuid,text,integer,text,uuid)` | uuid | False | True | postgres | Unchanged; no direct answer payload found |
| `log_points(uuid,integer,text,text,text)` | uuid | False | False | postgres | Unchanged; no direct answer payload found |
| `mojibake_byte(text)` | integer | True | True | postgres | Unchanged; no direct answer payload found |
| `next_damaged_questions(integer)` | TABLE(id uuid, question_text text, options jsonb, explanation text) | True | True | postgres | Answer-returning oracle: revoke PUBLIC/anon/authenticated; service only |
| `normalize_promo_code()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `pick_available_chapters(uuid,text,text,integer,integer)` | TABLE(chapter_id uuid, chapter_name text, subject text, unseen_count bigint) | True | True | postgres | Unchanged; no direct answer payload found |
| `prevent_self_subscription_escalation()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `protect_premium_fields()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `questions_legacy_backfill()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `questions_set_text_quality()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `questions_sync_class_level()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `recalc_user_accuracy()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `redeem_referral(text)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `repair_mojibake_batch(integer)` | integer | False | False | postgres | Service-only mutation; no returned solution payload |
| `repair_streak()` | jsonb | True | True | postgres | Unchanged; no direct answer payload found |
| `reset_user_progress(uuid)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `rls_auto_enable()` | event_trigger | False | False | postgres | Unchanged; no direct answer payload found |
| `set_updated_at()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `sign_contract(integer,integer,integer)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `start_battle(text,text,uuid,text)` | jsonb | False | True | postgres | Lifecycle: private legacy + authenticated guarded wrapper |
| `submit_battle_answer(uuid,uuid,text[],numeric)` | jsonb | False | True | postgres | Correctness-only; replace with pinned membership/round/receipt checks |
| `sync_daily_progress(uuid,boolean,integer)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `sync_profile_total_points()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `sync_question_text_columns()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `sync_questions_on_chapter_update()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `tier_shift(text,integer)` | text | True | True | postgres | Unchanged; no direct answer payload found |
| `topics_legacy_sync()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `touch_daily_missions_updated_at()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `touch_updated_at()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `trg_award_badges_on_attempt()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `trg_award_badges_on_streak()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `update_daily_accuracy(uuid,numeric)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `update_educator_content_updated_at()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `update_own_profile(text,text,text,text,text,integer,boolean,text,integer,date,text[])` | void | False | True | postgres | Unchanged; no direct answer payload found |
| `update_practice_stats(uuid,integer,boolean)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `update_question_reports_updated_at()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `update_revision_from_attempt()` | trigger | True | True | postgres | Trigger; not a directly invocable answer API |
| `update_streak_stats(uuid)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `update_updated_at_column()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |
| `upsert_topic_mastery(uuid,uuid,boolean)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `users_needing_reminder(integer)` | TABLE(user_id uuid, full_name text, daily_xp integer, xp_goal integer, current_streak integer) | False | False | postgres | Unchanged; no direct answer payload found |
| `validate_practice_answer(uuid,text[],numeric)` | jsonb | False | True | postgres | Answer-returning oracle: revoke PUBLIC/anon/authenticated; service only |
| `validate_promo_code(text,text,uuid)` | jsonb | False | True | postgres | Unchanged; no direct answer payload found |
| `validate_question_answer(uuid,text[],numeric,exam_code)` | jsonb | False | True | postgres | Answer-returning oracle: revoke PUBLIC/anon/authenticated; service only |
| `validate_question_answer(uuid,text)` | jsonb | False | True | postgres | Answer-returning oracle: revoke PUBLIC/anon/authenticated; service only |
| `validate_question_hierarchy()` | trigger | False | False | postgres | Trigger; not a directly invocable answer API |

## New authorized interfaces

- `get_assessment_review(uuid)`: authenticated owner; trusted receipts; formal completion; group-close embargo; cross-lifecycle reservations. Returns canonical solutions only after these gates.
- `admin_question_rows()` / `questions_admin`: authenticated caller with server-verified admin/super_admin role; full key-bearing question rows.
- `admin_content_health()` / `content_health`: authenticated verified staff, aggregate only, invoker view.
- `get_assessment`, issuance, draft, completion and battle-question delivery: key-free; never return solution fields.
- Private grading/sanitizing/admin/trigger helpers: service_role/postgres only; no client grants.
- Live-battle full-solution review endpoint is still absent: explicitly a closure blocker, not silently disabled or counted passed.

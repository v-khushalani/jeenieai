# Plan

## 1. Badge QA preview — make achievements visible

The current `BadgesShowcase` reads two sources:
- **Dynamic badges** (streaks / answer streaks): it checks `profiles.badges` for exact strings like `'Hot Streak'`.
- **Table badges**: it reads `public.badges` and `public.user_badges`.

Right now `public.badges` is empty, so only dynamic badges can ever show. To let you see the full cabinet, we will:

- Insert a few sample rows into `public.badges` (name, icon, description, category, points_required).
- Insert matching rows into `public.user_badges` for the QA test users.
- Optionally flip the dynamic strings in `profiles.badges` for users you want to see streak badges.
- Provide a single `SELECT` that mirrors exactly what the UI renders: earned status, rarity, progress, and earned date.

After this, changing a value in Supabase will actually reflect on the badges page.

### SQL for the QA preview

```sql
-- 1. Seed a few sample table badges
INSERT INTO public.badges (code, name, description, icon, category, points_required, points_reward, is_active) VALUES
('first_blood', 'First Blood', 'Pehla question sahi kiya 🎯', '🩸', 'achievement', 10, 20, true),
('100_club', '100 Club', '100 questions complete', '💯', 'achievement', 100, 50, true),
('500_club', '500 Club', '500 questions complete — serious player', '⚡', 'achievement', 500, 100, true),
('point_pioneer', 'Point Pioneer', '1000 JEEnie points earned', '💰', 'skill', 1000, 50, true),
('night_owl', 'Night Owl', 'Raat ko bhi padhai', '🦉', 'streak', 1, 10, true)
ON CONFLICT (code) DO NOTHING;

-- 2. Assign some badges to a QA user (replace with the actual user id)
INSERT INTO public.user_badges (user_id, badge_id, earned_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, id, now()
FROM public.badges
WHERE code IN ('first_blood', '100_club', 'point_pioneer', 'night_owl')
ON CONFLICT DO NOTHING;

-- 3. Unlock a dynamic streak badge for the same user
UPDATE public.profiles
SET badges = COALESCE(badges, '[]'::jsonb) || '["Hot Streak", "7-Day Warrior"]'::jsonb
WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;

-- 4. Preview the badge cabinet exactly as the UI sees it
WITH user_summary AS (
  SELECT
    p.id AS user_id,
    p.total_points,
    COALESCE(p.badges, '[]'::jsonb) AS badges_array
  FROM public.profiles p
  WHERE p.id = '00000000-0000-0000-0000-000000000000'::uuid
)
SELECT
  b.name,
  b.category,
  b.icon,
  b.points_required,
  CASE WHEN ub.user_id IS NOT NULL THEN true ELSE false END AS earned,
  ub.earned_at,
  CASE
    WHEN b.points_required >= 5000 THEN 'Mythic'
    WHEN b.points_required >= 2000 THEN 'Legendary'
    WHEN b.points_required >= 800  THEN 'Epic'
    WHEN b.points_required >= 200  THEN 'Rare'
    ELSE 'Common'
  END AS rarity,
  LEAST(100, ROUND((us.total_points::numeric / NULLIF(b.points_required, 0)) * 100)) AS progress_pct
FROM public.badges b
CROSS JOIN user_summary us
LEFT JOIN public.user_badges ub
       ON ub.badge_id = b.id AND ub.user_id = us.user_id
ORDER BY b.points_required;
```

Replace the placeholder UUID with the QA user id from `auth.users`.

## 2. Accuracy — best way to compute it

My recommendation is a **hybrid approach** with a single column as the source of truth for the dashboard:

- **Authoritative display value**: `profiles.overall_accuracy` is what the dashboard shows. This is fast, cache-friendly, and lets you override it in Supabase during QA without fighting the UI.
- **Authoritative underlying data**: `question_attempts` remains the single source of truth for every attempt. A Postgres trigger keeps `overall_accuracy` in sync automatically.
- **Period / subject / topic accuracy**: computed from `question_attempts` or `daily_progress` on the fly, because these are slices and change every day.

### Why this is better than only live-aggregating in the UI

- The current dashboard recomputes overall accuracy from the last 3000 practice attempts. If you edit `profiles.overall_accuracy` in Supabase, the dashboard ignores it.
- Keeping a derived column in `profiles` gives a single fast read and still guarantees correctness because the trigger recalculates from every attempt.
- It also lets you show a "last calculated" state during heavy ingestion.

### Trigger to keep `overall_accuracy` synced

```sql
CREATE OR REPLACE FUNCTION public.recalc_user_accuracy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
  total bigint;
  correct bigint;
  new_accuracy numeric;
BEGIN
  target_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_correct = true)
  INTO total, correct
  FROM public.question_attempts
  WHERE user_id = target_user_id
    AND mode = 'practice'
    AND is_correct IS NOT NULL;

  IF total = 0 THEN
    new_accuracy := 0;
  ELSE
    new_accuracy := ROUND((correct::numeric / total::numeric) * 100, 2);
  END IF;

  UPDATE public.profiles
  SET overall_accuracy = new_accuracy,
      total_questions_solved = total
  WHERE id = target_user_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS question_attempts_accuracy_trigger ON public.question_attempts;
CREATE TRIGGER question_attempts_accuracy_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.question_attempts
FOR EACH ROW
EXECUTE FUNCTION public.recalc_user_accuracy();
```

### Code change

In `src/hooks/useUserStats.ts`, switch the main `accuracy` stat from the live-aggregate to the already-fetched profile value:

```ts
const accuracy = Number(profileData?.overall_accuracy ?? 0);
```

Keep `todayAccuracy`, `subjectStats`, and `topicStats` computed from `daily_progress` / `question_attempts` because those are period-specific.

### Manual recalc for existing data

After deploying the trigger, run a one-off backfill so every user's `overall_accuracy` matches their attempts:

```sql
UPDATE public.profiles p
SET overall_accuracy = sub.accuracy,
    total_questions_solved = sub.total
FROM (
  SELECT user_id,
         COUNT(*) AS total,
         ROUND((COUNT(*) FILTER (WHERE is_correct = true)::numeric / COUNT(*)) * 100, 2) AS accuracy
  FROM public.question_attempts
  WHERE mode = 'practice' AND is_correct IS NOT NULL
  GROUP BY user_id
) sub
WHERE p.id = sub.user_id;
```

## Outcome

- Badges table will have sample data and you can see the full "Trophy Cabinet" for any QA user by tweaking `user_badges` or `profiles.badges`.
- Overall accuracy becomes a single, editable, auto-synced column. Editing it in Supabase will reflect instantly on the dashboard, while the trigger guarantees it stays correct as attempts come in.
- Period/subject/topic accuracy still computes from real attempt data so students get meaningful breakdowns.
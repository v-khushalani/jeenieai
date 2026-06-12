-- Fix update_streak_stats: bug where last_activity_date was overwritten BEFORE
-- the yesterday-check, causing streak to reset to 1 every day even when user
-- met daily goal yesterday and today. We now compute streak using last_streak_date
-- (which is only set when daily goal is met) for continuity, falling back to
-- last_activity_date only if last_streak_date is null.

CREATE OR REPLACE FUNCTION public.update_streak_stats(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_profile record;
  v_today text;
  v_yesterday text;
  v_today_start timestamptz;
  v_tomorrow_start timestamptz;
  v_new_streak integer;
  v_new_longest integer;
  v_days_since integer;
  v_used_freeze boolean := false;
  v_today_count bigint;
  v_daily_goal integer;
  v_reference_date date;
begin
  if auth.uid() is null or auth.uid() != p_user_id then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  v_today := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_yesterday := to_char((now() at time zone 'Asia/Kolkata' - interval '1 day'), 'YYYY-MM-DD');

  v_today_start := (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata');
  v_tomorrow_start := v_today_start + interval '1 day';

  select current_streak, longest_streak, last_activity_date, streak_freeze_available, daily_goal, last_streak_date
  into v_profile
  from profiles where id = p_user_id;

  if not found then
    return jsonb_build_object('error', 'Profile not found');
  end if;

  v_daily_goal := coalesce(v_profile.daily_goal, 15);

  -- IMPORTANT: capture reference date BEFORE we overwrite last_activity_date
  v_reference_date := coalesce(v_profile.last_streak_date, v_profile.last_activity_date);

  select count(*) into v_today_count
  from question_attempts
  where user_id = p_user_id
    and mode = 'practice'
    and created_at >= v_today_start
    and created_at < v_tomorrow_start;

  -- Always update activity timestamp
  update profiles set
    last_activity_date = v_today::date,
    last_activity = now(),
    updated_at = now()
  where id = p_user_id;

  -- Daily goal not met yet -> no streak change
  if v_today_count < v_daily_goal then
    return jsonb_build_object(
      'success', true,
      'streak', coalesce(v_profile.current_streak, 0),
      'daily_goal_met', false,
      'today_count', v_today_count,
      'daily_goal', v_daily_goal
    );
  end if;

  -- Already credited streak for today -> idempotent
  if v_profile.last_streak_date = v_today::date then
    v_new_streak := greatest(coalesce(v_profile.current_streak, 0), 1);
    v_new_longest := greatest(v_new_streak, coalesce(v_profile.longest_streak, 0));

    update profiles set
      current_streak = v_new_streak,
      longest_streak = v_new_longest,
      last_streak_date = v_today::date,
      updated_at = now()
    where id = p_user_id;

    return jsonb_build_object(
      'success', true,
      'streak', v_new_streak,
      'longest_streak', v_new_longest,
      'daily_goal_met', true,
      'already_updated', true
    );
  end if;

  -- New streak day: decide based on reference date (last_streak_date preferred)
  v_new_streak := coalesce(v_profile.current_streak, 0);

  if v_reference_date = v_yesterday::date then
    -- Continued from yesterday -> increment
    v_new_streak := greatest(1, v_new_streak + 1);
  elsif v_reference_date is not null then
    v_days_since := (v_today::date - v_reference_date)::integer;
    if v_days_since = 2 and coalesce(v_profile.streak_freeze_available, false) then
      v_new_streak := greatest(1, v_new_streak + 1);
      v_used_freeze := true;
    else
      -- Gap > 1 day, no freeze -> restart at 1
      v_new_streak := 1;
    end if;
  else
    -- First ever streak
    v_new_streak := 1;
  end if;

  v_new_longest := greatest(v_new_streak, coalesce(v_profile.longest_streak, 0));

  update profiles set
    current_streak = v_new_streak,
    longest_streak = v_new_longest,
    last_streak_date = v_today::date,
    streak_freeze_available = case when v_used_freeze then false else streak_freeze_available end,
    updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'streak', v_new_streak,
    'longest_streak', v_new_longest,
    'daily_goal_met', true,
    'used_freeze', v_used_freeze
  );
end;
$function$;

DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id,
    'authenticated', 'authenticated', 'jeenie.app@gmail.com',
    crypt('Jeenie@123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Jeenie Admin"}'::jsonb,
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'jeenie.app@gmail.com', 'email_verified', true),
    'email', new_user_id::text, now(), now(), now());

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = new_user_id) THEN
    UPDATE public.user_roles SET role = 'super_admin' WHERE user_id = new_user_id;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (new_user_id, 'super_admin');
  END IF;
END $$;

INSERT INTO public.subjects (code, name, icon, color_hsl, display_order, is_active)
SELECT v.code::subject_code, v.name, v.icon, v.color_hsl, v.display_order, v.is_active
FROM (VALUES
  ('PHYSICS',     'Physics',     '⚛️', '210 80% 50%', 1, true),
  ('CHEMISTRY',   'Chemistry',   '🧪', '140 70% 45%', 2, true),
  ('MATHEMATICS', 'Mathematics', '📐', '270 70% 55%', 3, true),
  ('BIOLOGY',     'Biology',     '🌿', '120 60% 45%', 4, true)
) AS v(code, name, icon, color_hsl, display_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.subjects s WHERE s.code::text = v.code);


-- Grant Pro to e2e-audit test user (1 year), and seed a payments row so tier resolves correctly.
UPDATE public.profiles
SET is_premium = true,
    subscription_end_date = now() + interval '365 days'
WHERE id = '60d49744-1b9d-4547-a7b6-1d6a052576cd';

INSERT INTO public.payments (user_id, razorpay_order_id, razorpay_payment_id, amount, currency, status, plan_id, plan_duration)
VALUES ('60d49744-1b9d-4547-a7b6-1d6a052576cd',
        'audit_order_' || extract(epoch from now())::bigint,
        'audit_pay_'   || extract(epoch from now())::bigint,
        499, 'INR', 'paid', 'yearly', 365);

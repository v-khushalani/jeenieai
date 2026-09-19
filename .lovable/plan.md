# Trust and positioning fixes

## Changes
- Replace the landing page’s three unverified metrics with one defensible claim: **50,000+ active questions**, based on the confirmed 53,318 active-question count.
- Remove urgency-led pricing language, food-price comparisons, and the fixed “58%” badge from the pricing modal.
- Show only the current plan price by default. Show savings only when database plan data provides a higher MRP, avoiding fallback “original price” claims.
- Rewrite related subscription messages in a calm, factual tone.
- Give Free users access to the latest 2 years of PYQs, while keeping 5 years for Pro and 10 years for Pro+.

## Technical details
- Limit changes to `LandingHero.tsx`, `PricingModal.tsx`, and `subscriptionPlans.ts`.
- Preserve existing plan retrieval and navigation behavior.
- Verify the current preview build after implementation.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DBSubscriptionPlan {
  id: string;
  name: string;
  tagline: string | null;
  tier: 'pro' | 'pro_plus';
  mrp_price: number | null;
  price: number;
  duration_days: number;
  display_duration: string;
  features: string[];
  is_popular: boolean;
  is_best_value: boolean;
  is_active: boolean;
  display_order: number;
  razorpay_plan_id: string | null;
}

export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ['subscription_plans'],
    queryFn: async (): Promise<DBSubscriptionPlan[]> => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as DBSubscriptionPlan[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

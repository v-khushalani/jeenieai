/**
 * Payments API Module
 * 
 * Handles all payment-related API operations
 */

import { apiClient } from '../apiClient';
import { cache, CACHE_TTL } from '../cache';
import type { PaymentOrder, PaymentVerification, ApiResponse } from '../types';
import { isSubscriptionActive, resolveSubscriptionTier } from '@/utils/subscriptionEntitlement';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  duration: 'monthly' | 'yearly';
  features: string[];
}

export const paymentsAPI = {
  /**
   * Get available plans
   */
  async getPlans(): Promise<SubscriptionPlan[]> {
    try {
      const { data, error } = await apiClient.rawClient
        .from('subscription_plans')
        .select('id, name, price, duration_days, features, is_active')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        throw error;
      }

      const rows = (data || []) as any[];
      return rows.map(r => ({
        id: r.id,
        name: r.name,
        price: Number(r.price),
        duration: (Number(r.duration_days) >= 365) ? 'yearly' : 'monthly',
        features: Array.isArray(r.features) ? r.features : [],
      }));
    } catch (err) {
      return [];
    }
  },

  /**
   * Create Razorpay order
   */
  async createOrder(
    _userId: string,
    planId: string,
    promoCode?: string
  ): Promise<ApiResponse<PaymentOrder>> {
    try {
      const result = await apiClient.callEdgeFunction<
        { planId: string; promoCode?: string },
        PaymentOrder
      >(
        'create-razorpay-order',
        { planId, promoCode },
        { useQueue: false }
      );

      return result;
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'PAYMENT_ERROR' },
      };
    }
  },

  /**
   * Verify payment
   */
  async verifyPayment(
    verification: PaymentVerification
  ): Promise<ApiResponse<{ success: boolean; subscription_end_date: string }>> {
    try {
      // Ensure we send the correct field names the edge function expects
      const payload = {
        razorpay_order_id: verification.razorpay_order_id,
        razorpay_payment_id: verification.razorpay_payment_id,
        razorpay_signature: verification.razorpay_signature,
        planId: verification.planId,
      };
      const result = await apiClient.callEdgeFunction<
        typeof payload,
        { success: boolean; subscription_end_date: string }
      >(
        'verify-payment',
        payload,
        { useQueue: false }
      );

      if (result.data?.success) {
        // Invalidate user cache to reflect new subscription
        cache.invalidateByPattern(/user:.*/);
      }

      return result;
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'VERIFICATION_ERROR' },
      };
    }
  },

  /**
   * Get user's subscription status
   */
  async getSubscriptionStatus(userId: string): Promise<ApiResponse<{
    isPremium: boolean;
    plan: string | null;
    tier: 'free' | 'pro' | 'pro_plus';
    expiresAt: string | null;
    daysRemaining: number | null;
  }>> {
    const cacheKey = `subscription:${userId}`;
    const cached = cache.get<{
      isPremium: boolean;
      plan: string | null;
      tier: 'free' | 'pro' | 'pro_plus';
      expiresAt: string | null;
      daysRemaining: number | null;
    }>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    type ProfileRow = {
      is_premium: boolean | null;
      subscription_end_date: string | null;
      subscription_plan: string | null;
      subscription_status: string | null;
      subscription_tier: string | null;
    };
    
    try {
      const { data: profile, error } = await apiClient.rawClient
        .from('profiles')
        .select('is_premium, subscription_end_date, subscription_plan, subscription_status, subscription_tier')
        .eq('id', userId)
        .single() as unknown as { data: ProfileRow | null; error: { message: string; code: string } | null };

      if (error || !profile) {
        return { data: null, error: error ? { message: error.message, code: error.code } : { message: 'Profile not found', code: 'NOT_FOUND' } };
      }

      let daysRemaining: number | null = null;
      if (profile.subscription_end_date) {
        const endDate = new Date(profile.subscription_end_date);
        const now = new Date();
        daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysRemaining < 0) daysRemaining = 0;
      }

      // Check both is_premium flag AND subscription_end_date expiry
      const isPremiumActive = isSubscriptionActive(profile);
      const tier = resolveSubscriptionTier(profile);

      const status = {
        isPremium: isPremiumActive,
        // Prefer explicit plan id from profile; fallback to tier when plan id is missing
        plan: isPremiumActive ? (profile.subscription_plan || tier) : null,
        tier,
        expiresAt: profile.subscription_end_date,
        daysRemaining,
      };

      cache.set(cacheKey, status, CACHE_TTL.MEDIUM);

      return { data: status, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Cancel subscription
   */
  async cancelSubscription(_userId: string): Promise<ApiResponse<{ success: boolean }>> {
    try {
      const { data, error } = await apiClient.rawClient
        .rpc('cancel_subscription');

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      const result = data as Record<string, unknown> | null;
      if (result?.error) {
        return { data: null, error: { message: String(result.error), code: 'ERROR' } };
      }

      // Invalidate cache
      cache.invalidateByPattern(/subscription:.*/);
      cache.invalidateByPattern(/user:.*/);

      return { data: { success: true }, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Create batch purchase order
   */
  async createBatchOrder(
    _userId: string,
    batchId: string,
    _amount?: number
  ): Promise<ApiResponse<PaymentOrder>> {
    try {
      // Edge function only needs batchId - it fetches price from DB server-side
      const result = await apiClient.callEdgeFunction<
        { batchId: string },
        PaymentOrder
      >(
        'create-batch-order',
        { batchId },
        { useQueue: false }
      );

      return result;
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'PAYMENT_ERROR' },
      };
    }
  },

  /**
   * Sync batch payment
   */
  async syncBatchPayment(
    orderId: string,
    paymentId: string,
    signature: string,
    batchId: string
  ): Promise<ApiResponse<{ success: boolean }>> {
    try {
      // Field names must match what the edge function expects
      const result = await apiClient.callEdgeFunction<
        { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string; batchId: string },
        { success: boolean }
      >(
        'sync-batch-payment',
        { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature, batchId },
        { useQueue: false }
      );

      if (result.data?.success) {
        cache.invalidateByPattern(/user:.*/);
      }

      return result;
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'SYNC_ERROR' },
      };
    }
  },
};

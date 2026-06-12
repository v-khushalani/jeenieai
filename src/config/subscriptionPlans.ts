// src/config/subscriptionPlans.ts
// NOTE: Plan definitions (prices, durations, IDs) are now stored in the
// `subscription_plans` DB table and should be read via `useSubscriptionPlans()`
// or dedicated API endpoints. This file retains only non-price fallbacks
// (limits, messages, and feature flags).

export const FREE_LIMITS = {
  questionsPerDay: 15,
  testsPerMonth: 2,
  aiDoubtSolver: false,
  aiStudyPlanner: false,
  analyticsAdvanced: false,
  pyqAccess: false,
};

export const PRO_FEATURES = {
  questionsPerDay: Infinity,
  testsPerMonth: Infinity,
  aiDoubtQuotaPerDay: 30,
  aiStudyPlanner: true,
  analyticsAdvanced: true,
  prioritySupport: true,
  pyqYears: 5,
  rankPredictor: false,
  educatorContent: false,
};

export const PRO_PLUS_FEATURES = {
  questionsPerDay: Infinity,
  testsPerMonth: Infinity,
  aiDoubtQuotaPerDay: 100,
  aiStudyPlanner: true,
  analyticsAdvanced: true,
  prioritySupport: true,
  pyqYears: 10,
  rankPredictor: true,
  educatorContent: true,
  adaptiveStudyPlanner: true,
};

export const REFERRAL_CONFIG = {
  enabled: true,
  rewardDays: 7,
  maxRewards: 4,
  message: 'Refer 4 friends & get 1 month FREE Pro!',
};

export const CONVERSION_MESSAGES = {
  dailyLimit: {
    title: '🚀 Daily Limit Reached!',
    message: "You've crushed 15 questions today! Come back tomorrow or unlock UNLIMITED practice.",
    cta: 'View Plans',
    subtitle: '🔥 Just ₹2.46/day — Less than a chai!',
  },
  testLimit: {
    title: '📝 Test Limit Reached',
    message: "You've used all your free tests this month. Get unlimited tests with Pro or Pro Plus!",
    cta: 'Unlock Unlimited Tests',
    subtitle: '🎯 Practice makes perfect!',
  },
  aiDoubtBlocked: {
    title: '🤖 AI Doubt Solver — Pro Feature',
    message: 'Get instant doubt solving with your personal AI tutor!',
    cta: 'Unlock AI Doubt Solver',
    subtitle: '⚡ Your doubts, solved in seconds',
  },
  aiQuotaExceeded: {
    title: '⚡ AI Doubt Quota Reached',
    message: 'You hit today\'s AI doubt limit. Comes back tomorrow or upgrade to Pro+.',
    cta: 'Upgrade to Pro+',
    subtitle: 'Pro+ gets 100 doubts/day',
  },
  studyPlannerBlocked: {
    title: '📅 AI Study Planner — Pro Feature',
    message: 'Get a smart study plan that adapts to YOUR progress and exam date!',
    cta: 'Get Smart Study Plan',
    subtitle: '🧠 Plan smarter, not harder',
  },
  pyqBlocked: {
    title: '📚 PYQs — Pro Feature',
    message: 'Practice Previous Year Questions to crack JEE/NEET smarter.',
    cta: 'Unlock PYQs',
    subtitle: 'Pro: 5 yrs • Pro+: 10+ yrs',
  },
  rankPredictorBlocked: {
    title: '🎯 Rank Predictor — Pro+ Feature',
    message: 'AI-powered rank prediction based on your performance.',
    cta: 'Upgrade to Pro+',
    subtitle: 'Know your rank before the exam',
  },
};

export const PAYMENT_CONFIG = {
  currency: 'INR',
  acceptedMethods: ['card', 'upi', 'netbanking', 'wallet'],
  refundPolicy: '7-day money-back guarantee',
  support: 'support@jeenie.website',
};

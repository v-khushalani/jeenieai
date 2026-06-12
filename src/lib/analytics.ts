// Analytics service for tracking user events and page views
// Supports multiple analytics providers (Google Analytics, Mixpanel, custom)

type EventProperties = Record<string, string | number | boolean | undefined>;
type MixpanelClient = {
  init: (token: string, config?: Record<string, unknown>) => void;
  track: (eventName: string, properties?: EventProperties) => void;
  identify: (userId: string) => void;
  people: { set: (traits: Record<string, unknown>) => void };
  reset: () => void;
};

interface AnalyticsConfig {
  googleAnalyticsId?: string;
  mixpanelToken?: string;
  enabled: boolean;
}

class Analytics {
  private config: AnalyticsConfig = {
    enabled: false,
  };
  private initialized = false;
  private mixpanelEnabled = false;
  private mixpanel: MixpanelClient | null = null;
  private mixpanelInitPromise: Promise<void> | null = null;

  private ensureMixpanelLoaded(token: string): Promise<void> {
    if (this.mixpanelInitPromise) {
      return this.mixpanelInitPromise;
    }

    this.mixpanelInitPromise = (async () => {
      try {
        const module = await import('mixpanel-browser');
        const mixpanel = module.default as unknown as MixpanelClient;
        mixpanel.init(token, {
          api_host: 'https://api.mixpanel.com',
          debug: import.meta.env.DEV,
        });
        this.mixpanel = mixpanel;
        this.mixpanelEnabled = true;
      } catch {
        this.mixpanel = null;
        this.mixpanelEnabled = false;
      }
    })();

    return this.mixpanelInitPromise;
  }

  init(config: Partial<AnalyticsConfig> = {}) {
    this.config = {
      googleAnalyticsId: import.meta.env.VITE_GA_ID || config.googleAnalyticsId,
      mixpanelToken: import.meta.env.VITE_MIXPANEL_TOKEN || config.mixpanelToken,
      enabled: import.meta.env.PROD,
    };

    if (!this.config.enabled) {
      return;
    }

    // Initialize Google Analytics
    if (this.config.googleAnalyticsId) {
      this.initGoogleAnalytics();
    }

    // Initialize Mixpanel if token is provided
    if (this.config.mixpanelToken) {
      void this.ensureMixpanelLoaded(this.config.mixpanelToken);
    }

    this.initialized = true;
  }

  private initGoogleAnalytics() {
    if (!this.config.googleAnalyticsId) return;

    // Load gtag script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${this.config.googleAnalyticsId}`;
    document.head.appendChild(script);

    // Initialize gtag
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', this.config.googleAnalyticsId, {
      send_page_view: false, // We'll manually track page views
    });
  }

  // Track page views
  pageView(path: string, title?: string) {
    if (!this.config.enabled || !this.initialized) return;

    if (this.config.googleAnalyticsId && window.gtag) {
      window.gtag('event', 'page_view', {
        page_path: path,
        page_title: title,
      });
    }

    if (this.mixpanelEnabled && this.mixpanel) {
      this.mixpanel.track('page_view', {
        page_path: path,
        page_title: title,
      });
    }
  }

  // Track custom events
  event(eventName: string, properties?: EventProperties) {
    if (!this.config.enabled || !this.initialized) return;

    if (this.config.googleAnalyticsId && window.gtag) {
      window.gtag('event', eventName, properties);
    }

    if (this.mixpanelEnabled && this.mixpanel) {
      this.mixpanel.track(eventName, properties);
    }
  }

  // Pre-defined events for JEE learning platform
  trackQuestionAttempt(data: {
    subject: string;
    topic: string;
    difficulty: string;
    isCorrect: boolean;
    timeSpent: number;
  }) {
    this.event('question_attempt', {
      subject: data.subject,
      topic: data.topic,
      difficulty: data.difficulty,
      is_correct: data.isCorrect,
      time_spent: data.timeSpent,
    });
  }

  trackTestCompleted(data: {
    testId: string;
    testType: string;
    score: number;
    totalQuestions: number;
    timeTaken: number;
  }) {
    this.event('test_completed', {
      test_id: data.testId,
      test_type: data.testType,
      score: data.score,
      total_questions: data.totalQuestions,
      time_taken: data.timeTaken,
    });
  }

  trackLessonStarted(data: {
    subject: string;
    chapter: string;
    topic: string;
  }) {
    this.event('lesson_started', {
      subject: data.subject,
      chapter: data.chapter,
      topic: data.topic,
    });
  }

  trackLessonCompleted(data: {
    subject: string;
    chapter: string;
    topic: string;
    timeSpent: number;
  }) {
    this.event('lesson_completed', {
      subject: data.subject,
      chapter: data.chapter,
      topic: data.topic,
      time_spent: data.timeSpent,
    });
  }

  trackSignup(method: string) {
    this.event('sign_up', { method });
  }

  trackLogin(method: string) {
    this.event('login', { method });
  }

  trackSubscription(data: {
    plan: string;
    price: number;
    duration: string;
  }) {
    this.event('subscription_purchase', {
      plan: data.plan,
      price: data.price,
      duration: data.duration,
    });
  }

  trackAIDoubtSolved(data: {
    subject: string;
    topic?: string;
    responseTime: number;
  }) {
    this.event('ai_doubt_solved', {
      subject: data.subject,
      topic: data.topic,
      response_time: data.responseTime,
    });
  }

  // User identification
  identify(userId: string, traits?: EventProperties) {
    if (!this.config.enabled || !this.initialized) return;

    if (this.config.googleAnalyticsId && window.gtag) {
      window.gtag('config', this.config.googleAnalyticsId, {
        user_id: userId,
        ...traits,
      });
    }

    if (this.mixpanelEnabled && this.mixpanel) {
      this.mixpanel.identify(userId);
      if (traits && Object.keys(traits).length > 0) {
        try {
          // Mixpanel people properties for richer profiles
          this.mixpanel.people.set(traits as Record<string, unknown>);
        } catch {
          // Ignore if people API is not available
        }
      }
    }

  }

  // Reset user on logout
  reset() {
    if (this.config.googleAnalyticsId && window.gtag) {
      window.gtag('config', this.config.googleAnalyticsId, {
        user_id: undefined,
      });
    }

    if (this.mixpanelEnabled && this.mixpanel) {
      this.mixpanel.reset();
    }
  }
}

// Singleton instance
export const analytics = new Analytics();

// Type declarations for gtag
declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

export default analytics;

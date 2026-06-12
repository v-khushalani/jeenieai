import { analytics } from '@/lib/analytics';
import { logger } from '@/utils/logger';

// Initialize client-side analytics (Google Analytics + Mixpanel)
// Safe to call multiple times; underlying service guards initialization.
export const initMixpanel = () => {
	try {
		analytics.init();
		// Optionally track that the app booted
		analytics.event('app_initialized');
	} catch (error) {
		// Never break the app if analytics fails
		logger.error('[Analytics] init failed', error);
	}
};

export default initMixpanel;

import { supabase } from "@/integrations/supabase/client";
import { logger } from "./logger";

/**
 * PRODUCTION SMOKE TESTS
 * Automated checks for critical app routes and API connectivity.
 */
export const runSmokeTests = async () => {
  const results = {
    auth: false,
    database: false,
    edge_functions: false,
    storage: false,
    timestamp: new Date().toISOString()
  };

  logger.info('system', 'Starting automated smoke tests...');

  try {
    // 1. Auth & Session Check
    const { data: { session } } = await supabase.auth.getSession();
    results.auth = !!session;

    // 2. Database Connectivity
    const { count, error: dbError } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .limit(1);
    results.database = !dbError && count !== null;

    // 3. Edge Function Pulse
    // We call a lightweight health RPC or a known edge function with a ping
    const { data: healthData, error: healthError } = await supabase.rpc('get_system_health_status');
    results.edge_functions = !healthError && !!healthData;

    // 4. Storage Bucket Accessibility
    const { data: buckets, error: storageError } = await supabase.storage.listBuckets();
    results.storage = !storageError && buckets.length > 0;

    const allPassed = Object.values(results).every(v => typeof v === 'boolean' ? v : true);
    
    if (allPassed) {
      logger.info('system', 'Smoke tests passed successfully', results);
    } else {
      logger.warn('system', 'Smoke tests failed one or more checks', results);
    }

    return results;
  } catch (err) {
    logger.error('system', 'Smoke tests encountered a critical failure', { error: err });
    return results;
  }
};

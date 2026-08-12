import { supabase } from "@/integrations/supabase/client";

type LogLevel = 'info' | 'warning' | 'error' | 'critical';

export const logger = {
  async log(
    level: LogLevel,
    category: string,
    message: string,
    metadata: Record<string, any> = {}
  ) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from('system_logs').insert({
        level,
        category,
        message,
        metadata,
        user_id: user?.id,
        route: window.location.pathname,
        user_agent: navigator.userAgent
      });
      
      // Also log to console for development
      const consoleMethod = level === 'critical' || level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
      console[consoleMethod](`[${category.toUpperCase()}] ${message}`, metadata);
    } catch (err) {
      console.error('Failed to send log to Supabase:', err);
    }
  },

  info(category: string, message: string, metadata?: Record<string, any>) {
    return this.log('info', category, message, metadata);
  },

  warn(category: string, message: string, metadata?: Record<string, any>) {
    return this.log('warning', category, message, metadata);
  },

  error(category: string, message: string, metadata?: Record<string, any>) {
    return this.log('error', category, message, metadata);
  },

  critical(category: string, message: string, metadata?: Record<string, any>) {
    return this.log('critical', category, message, metadata);
  }
};

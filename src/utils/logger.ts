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
      
      // In development, we also log to console
      const consoleMethod = level === 'critical' || level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
      console[consoleMethod](`[${category.toUpperCase()}] ${message}`, metadata);

      await supabase.from('system_logs').insert({
        level,
        category,
        message,
        metadata,
        user_id: user?.id,
        route: window.location.pathname,
        user_agent: navigator.userAgent
      });
    } catch (err) {
      console.error('Failed to send log to Supabase:', err);
    }
  },

  // Compatibility method for existing logger.log(msg, ...) calls
  async info(categoryOrMessage: string, messageOrMetadata?: string | Record<string, any>, metadata?: Record<string, any>) {
    if (typeof messageOrMetadata === 'string') {
      return this.log('info', categoryOrMessage, messageOrMetadata, metadata);
    }
    return this.log('info', 'general', categoryOrMessage, messageOrMetadata as Record<string, any>);
  },

  async warn(categoryOrMessage: string, messageOrMetadata?: string | Record<string, any>, metadata?: Record<string, any>) {
    if (typeof messageOrMetadata === 'string') {
      return this.log('warning', categoryOrMessage, messageOrMetadata, metadata);
    }
    return this.log('warning', 'general', categoryOrMessage, messageOrMetadata as Record<string, any>);
  },

  async error(categoryOrMessage: string, messageOrMetadata?: string | Record<string, any>, metadata?: Record<string, any>) {
    if (typeof messageOrMetadata === 'string') {
      return this.log('error', categoryOrMessage, messageOrMetadata, metadata);
    }
    return this.log('error', 'general', categoryOrMessage, messageOrMetadata as Record<string, any>);
  },

  async critical(categoryOrMessage: string, messageOrMetadata?: string | Record<string, any>, metadata?: Record<string, any>) {
    if (typeof messageOrMetadata === 'string') {
      return this.log('critical', categoryOrMessage, messageOrMetadata, metadata);
    }
    return this.log('critical', 'general', categoryOrMessage, messageOrMetadata as Record<string, any>);
  }
};

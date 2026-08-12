import { supabase } from "@/integrations/supabase/client";

type LogLevel = 'info' | 'warning' | 'error' | 'critical';

export const logger = {
  async log(
    levelOrMessage: LogLevel | string,
    messageOrMetadata?: any,
    metadataOrUndefined?: any,
    ...extra: any[]
  ) {
    try {
      let level: LogLevel = 'info';
      let category = 'general';
      let message = '';
      let metadata: any = {};

      // Handle logger.log('level', 'message', ...)
      if (['info', 'warning', 'error', 'critical'].includes(levelOrMessage)) {
        level = levelOrMessage as LogLevel;
        if (typeof messageOrMetadata === 'string') {
          message = messageOrMetadata;
          metadata = metadataOrUndefined || {};
        } else {
          message = 'Logged object';
          metadata = messageOrMetadata || {};
        }
      } else {
        // Handle logger.log('message', metadata)
        message = levelOrMessage;
        metadata = messageOrMetadata || {};
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      const consoleMethod = level === 'critical' || level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
      console[consoleMethod](`[${category.toUpperCase()}] ${message}`, metadata);

      // We only insert into DB if we have a valid level string
      await supabase.from('system_logs').insert({
        level: level === 'warning' ? 'warning' : level, // enum mapping
        category,
        message,
        metadata: typeof metadata === 'object' ? metadata : { value: metadata },
        user_id: user?.id,
        route: window.location.pathname,
        user_agent: navigator.userAgent
      });
    } catch (err) {
      console.error('Failed to send log to Supabase:', err);
    }
  },

  info(msg: string, meta?: any, ...extra: any[]) {
    return this.log('info', msg, meta);
  },

  warn(msg: string, meta?: any, ...extra: any[]) {
    return this.log('warning', msg, meta);
  },

  error(msg: string, meta?: any, ...extra: any[]) {
    return this.log('error', msg, meta);
  },

  critical(msg: string, meta?: any, ...extra: any[]) {
    return this.log('critical', msg, meta);
  }
};

import { supabase } from "@/integrations/supabase/client";

type LogLevel = 'info' | 'warning' | 'error' | 'critical';

const LEVELS: LogLevel[] = ['info', 'warning', 'error', 'critical'];

// Only these levels are persisted. `info` logs used to hit the network on every
// call (one auth/v1/user + one insert) which flooded the console with 401s for
// signed-out visitors and slowed every page down.
const PERSISTED_LEVELS = new Set<LogLevel>(['error', 'critical']);

export const logger = {
  async log(
    levelOrMessage: LogLevel | string,
    messageOrMetadata?: any,
    metadataOrUndefined?: any,
    ..._extra: any[]
  ) {
    let level: LogLevel = 'info';
    const category = 'general';
    let message = '';
    let metadata: any = {};

    if (LEVELS.includes(levelOrMessage as LogLevel)) {
      level = levelOrMessage as LogLevel;
      if (typeof messageOrMetadata === 'string') {
        message = messageOrMetadata;
        metadata = metadataOrUndefined || {};
      } else {
        message = 'Logged object';
        metadata = messageOrMetadata || {};
      }
    } else {
      message = levelOrMessage;
      metadata = messageOrMetadata || {};
    }

    const consoleMethod =
      level === 'critical' || level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
    if (import.meta.env.DEV || consoleMethod !== 'log') {
      console[consoleMethod](`[${category.toUpperCase()}] ${message}`, metadata);
    }

    if (!PERSISTED_LEVELS.has(level)) return;

    try {
      // getSession reads the cached session (no network round-trip).
      // Signed-out visitors cannot insert (RLS is authenticated-only), so skip.
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) return;

      await supabase.from('system_logs').insert({
        level,
        category,
        message: String(message).slice(0, 2000),
        metadata: typeof metadata === 'object' && metadata !== null ? metadata : { value: metadata },
        user_id: userId,
        route: window.location.pathname,
        user_agent: navigator.userAgent,
      });
    } catch {
      // Never let logging break the app or spam the console.
    }
  },

  info(msg: string, meta?: any, ...extra: any[]) {
    return this.log('info', msg, meta, ...extra);
  },

  warn(msg: string, meta?: any, ...extra: any[]) {
    return this.log('warning', msg, meta, ...extra);
  },

  error(msg: string, meta?: any, ...extra: any[]) {
    return this.log('error', msg, meta, ...extra);
  },

  critical(msg: string, meta?: any, ...extra: any[]) {
    return this.log('critical', msg, meta, ...extra);

  }
};

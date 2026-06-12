/**
 * Environment-aware logger utility
 * Logs to console only in development, always logs errors
 */

type LogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

class Logger {
  private isDevelopment = import.meta.env.DEV;
  private isVerbose = import.meta.env.VITE_VERBOSE_LOGS === 'true';

  private shouldLog() {
    return this.isDevelopment && this.isVerbose;
  }

  log(...args: any[]) {
    if (this.shouldLog()) {
      console.log(...args);
    }
  }

  info(...args: any[]) {
    if (this.shouldLog()) {
      console.info(...args);
    }
  }

  warn(...args: any[]) {
    if (this.shouldLog()) {
      console.warn(...args);
    }
  }

  error(...args: any[]) {
    if (this.isDevelopment || this.isVerbose) {
      console.error(...args);
    }
  }

  debug(...args: any[]) {
    if (this.shouldLog()) {
      console.debug(...args);
    }
  }

  group(label: string) {
    if (this.shouldLog()) {
      console.group(label);
    }
  }

  groupEnd() {
    if (this.isDevelopment) {
      console.groupEnd();
    }
  }

  table(data: any) {
    if (this.shouldLog()) {
      console.table(data);
    }
  }
}

export const logger = new Logger();

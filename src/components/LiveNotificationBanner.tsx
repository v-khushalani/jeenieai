import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface IncomingNotification {
  id: string;
  title: string;
  message: string;
}

// Notification sound - short pleasant chime
const playNotificationSound = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // First tone
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.frequency.setValueAtTime(830, audioCtx.currentTime);
    osc1.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.08);
    gain1.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.3);

    // Second tone (harmony)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.1);
    gain2.gain.setValueAtTime(0.2, audioCtx.currentTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    osc2.start(audioCtx.currentTime + 0.1);
    osc2.stop(audioCtx.currentTime + 0.4);
  } catch {
    // Audio not available
  }
};

const triggerVibration = () => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
  } catch {
    // Vibration not available
  }
};

export const LiveNotificationBanner: React.FC = () => {
  const { user } = useAuth();
  const [queue, setQueue] = useState<IncomingNotification[]>([]);
  const [current, setCurrent] = useState<IncomingNotification | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const dismissTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setIsExiting(true);
    dismissTimerRef.current = setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
      setCurrent(null);
      dismissTimerRef.current = null;
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, []);

  // Process queue
  useEffect(() => {
    if (!current && queue.length > 0) {
      const [next, ...rest] = queue;
      setCurrent(next);
      setQueue(rest);
      setIsVisible(true);
      setIsExiting(false);

      playNotificationSound();
      triggerVibration();

      // Auto-dismiss after 5s
      const timer = setTimeout(dismiss, 5000);
      return () => clearTimeout(timer);
    }
  }, [current, queue, dismiss]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('live-notif-banner')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as any;
          setQueue(prev => [...prev, {
            id: n.id,
            title: n.title,
            message: n.message,
          }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  if (!current || !isVisible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-9999 flex justify-center px-3 pt-3">
      <div
        className={cn(
          'w-full max-w-md',
          'transform transition-all duration-300 ease-out',
          isExiting
            ? '-translate-y-full opacity-0 scale-95'
            : 'translate-y-0 opacity-100 scale-100'
        )}
        style={{
          animation: !isExiting ? 'notifSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
        }}
      >
        {/* Glassmorphism card */}
        <div className="relative overflow-hidden rounded-2xl shadow-2xl border border-white/20 backdrop-blur-xl bg-linear-to-br from-primary/90 via-primary to-primary/80">
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_2s_ease-in-out_infinite]" />
          
          {/* Glow effect */}
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full bg-white/5 blur-xl" />

          <div className="relative p-4">
            <div className="flex items-start gap-3">
              {/* App icon */}
              <div className="shrink-0 w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-lg ring-1 ring-white/30">
                <img src="/pwa-192x192.png" alt="" className="w-7 h-7 rounded-lg" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">JEEnie</span>
                  <span className="text-[10px] text-white/40">• just now</span>
                </div>
                <p className="text-sm font-bold text-white leading-tight truncate">
                  {current.title}
                </p>
                <p className="text-xs text-white/80 mt-0.5 line-clamp-2 leading-relaxed">
                  {current.message}
                </p>
              </div>

              {/* Close */}
              <button
                onClick={dismiss}
                className="shrink-0 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors mt-0.5"
              >
                <X className="w-3.5 h-3.5 text-white/70" />
              </button>
            </div>

            {/* Bottom bar indicator */}
            <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-white/40 rounded-full"
                style={{
                  animation: 'notifProgress 5s linear forwards',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes notifSlideIn {
          0% { transform: translateY(-120%) scale(0.9); opacity: 0; }
          50% { transform: translateY(4%) scale(1.02); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes notifProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
};

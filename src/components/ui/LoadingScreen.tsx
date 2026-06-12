import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingScreenProps {
  pageName?: string;
  message?: string;
}

const LoadingScreen = React.forwardRef<HTMLDivElement, LoadingScreenProps>(
  ({ pageName = 'JEEnie', message }, ref) => (
    <div
      ref={ref}
      className="min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-[radial-gradient(circle_at_top,rgba(1,48,98,0.10),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(242,246,255,0.96))] text-foreground"
    >
      <div className="w-full max-w-sm rounded-4xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-2xl shadow-primary/10 px-6 py-8 flex flex-col items-center text-center">
        <div className="relative mb-5">
          <div className="absolute inset-0 rounded-full bg-primary/15 blur-xl animate-pulse" />
          <img
            src="/logo.png"
            alt="JEEnie learning logo"
            className="relative h-16 w-16 rounded-2xl shadow-lg ring-4 ring-white/80"
            loading="eager"
          />
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
          <Loader2 className="h-3 w-3 animate-spin" />
          Opening {pageName}
        </div>
        <h2 className="mt-4 text-xl font-extrabold tracking-tight text-primary">
          Ruko Zara! JEEnie ready ho raha hai
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {message || 'JEEnie is getting this page ready for you.'}
        </p>
      </div>
    </div>
  )
);

LoadingScreen.displayName = 'LoadingScreen';

export default LoadingScreen;

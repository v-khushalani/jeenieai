import React from 'react';
import { Loader2 } from 'lucide-react';
import MascotBadge from '@/components/brand/MascotBadge';
import { BRAND, LOADING_LINES } from '@/config/brand';

interface LoadingScreenProps {
  pageName?: string;
  message?: string;
}

const LoadingScreen = React.forwardRef<HTMLDivElement, LoadingScreenProps>(
  ({ pageName = BRAND.name, message }, ref) => {
    const [lineIndex, setLineIndex] = React.useState(() =>
      Math.floor(Math.random() * LOADING_LINES.length)
    );

    React.useEffect(() => {
      const id = window.setInterval(
        () => setLineIndex((i) => (i + 1) % LOADING_LINES.length),
        2200
      );
      return () => window.clearInterval(id);
    }, []);

    return (
      <div
        ref={ref}
        className="min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.10),transparent_35%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.6))] text-foreground"
      >
        <div className="w-full max-w-sm rounded-3xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-2xl shadow-primary/10 px-6 py-8 flex flex-col items-center text-center">
          <MascotBadge mood="think" size={84} glow float className="mb-4" />

          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            <Loader2 className="h-3 w-3 animate-spin" />
            Opening {pageName}
          </div>

          <h2 className="mt-4 text-xl font-extrabold tracking-tight text-primary">
            {message || LOADING_LINES[lineIndex]}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {BRAND.name} — {BRAND.tagline}
          </p>
        </div>
      </div>
    );
  }
);

LoadingScreen.displayName = 'LoadingScreen';

export default LoadingScreen;

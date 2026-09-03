import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2, X, Loader2, AlertTriangle,  ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import AnnotationOverlay from './AnnotationOverlay';
import { useAuth } from '@/contexts/AuthContext';

interface SimulationViewerProps {
  src: string;
  title?: string;
  className?: string;
  onClose?: () => void;
  hideHeader?: boolean;
}

const SimulationViewer: React.FC<SimulationViewerProps> = ({
  src,
  title = 'Interactive Animation',
  className,
  onClose,
  hideHeader = false,
}) => {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const frameAreaRef = useRef<HTMLDivElement>(null);
  const [frameArea, setFrameArea] = useState({ w: 0, h: 0 });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resizeTimersRef = useRef<number[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const normalizedSrc = src.trim();
  const htmlContent = normalizedSrc.startsWith('<') ? src : '';
  const effectiveSrc = htmlContent ? undefined : normalizedSrc || undefined;
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  const [usesParentWatermark, setUsesParentWatermark] = useState(!htmlContent);
  const [now, setNow] = useState(() => new Date());

  const institute =
    (user?.user_metadata?.institute as string) ||
    (user?.user_metadata?.full_name as string) ||
    user?.email ||
    'JEEnie Educator';

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {
        setIsFullscreen((f) => !f);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const clearResizeTimers = () => {
    resizeTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    resizeTimersRef.current = [];
  };

  const nudgeSimulationResize = () => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;

    try {
      frameWindow.dispatchEvent(new Event('resize'));
      frameWindow.dispatchEvent(new Event('orientationchange'));
      frameWindow.postMessage({ type: 'JEENIE_SIMULATION_VIEWPORT_RESIZE' }, '*');
    } catch {
      // Cross-origin embeds may reject parent-driven resize events.
    }
  };

  const scheduleSimulationResizeNudges = () => {
    clearResizeTimers();
    [0, 80, 220, 500, 900, 1500].forEach((delay) => {
      const timerId = window.setTimeout(nudgeSimulationResize, delay);
      resizeTimersRef.current.push(timerId);
    });
  };

  const injectWatermarkIntoFrame = () => {
    const frameWindow = iframeRef.current?.contentWindow;
    const frameDocument = iframeRef.current?.contentDocument;
    if (!frameWindow || !frameDocument?.body) return false;

    try {
      frameDocument.getElementById('jeenie-frame-protection-style')?.remove();
      frameDocument.getElementById('jeenie-frame-watermark')?.remove();

      const style = frameDocument.createElement('style');
      style.id = 'jeenie-frame-protection-style';
      style.textContent = `
        @keyframes jeenieFrameWatermarkDrift {
          0% { transform: translate3d(-5%, -4%, 0) rotate(-22deg); }
          50% { transform: translate3d(4%, 3%, 0) rotate(-22deg); }
          100% { transform: translate3d(-5%, -4%, 0) rotate(-22deg); }
        }
        html, body {
          -webkit-user-select: none;
          -ms-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
        }
        #jeenie-frame-watermark {
          position: fixed;
          inset: -24%;
          z-index: 2147483646;
          pointer-events: none;
          opacity: 0.03;
          display: flex;
          flex-wrap: wrap;
          gap: 140px 190px;

          padding: 42px;
          align-content: center;
          justify-content: center;
          animation: jeenieFrameWatermarkDrift 24s ease-in-out infinite;
          contain: layout paint style;
          mix-blend-mode: multiply;
        }
        #jeenie-frame-watermark span {
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 13px;
          font-weight: 600;

          letter-spacing: 0.08em;
          color: color-mix(in srgb, CanvasText 76%, transparent);
          white-space: nowrap;
        }
        @media print {
          body * { visibility: hidden !important; }
          body::before {
            content: 'Printing is disabled for protected JEEnie content.';
            visibility: visible !important;
            display: block;
            padding-top: 35vh;
            text-align: center;
            font: 700 24px ui-sans-serif, system-ui, -apple-system, sans-serif;
          }
        }
      `;
      frameDocument.head.appendChild(style);

      const layer = frameDocument.createElement('div');
      layer.id = 'jeenie-frame-watermark';
      layer.setAttribute('aria-hidden', 'true');

      const renderWatermark = () => {
        layer.replaceChildren();
        const currentStamp = `${institute} • ${new Date().toLocaleString()}`;
        for (let i = 0; i < 6; i += 1) {
          const span = frameDocument.createElement('span');
          span.textContent = `JEEnie • ${currentStamp}`;
          layer.appendChild(span);
        }
      };

      renderWatermark();
      frameDocument.body.appendChild(layer);
      const intervalId = frameWindow.setInterval(renderWatermark, 30_000);

      const blockKey = (event: KeyboardEvent) => {
        if (event.key === 'PrintScreen') event.preventDefault();
        if ((event.ctrlKey || event.metaKey) && ['p', 's', 'u'].includes(event.key.toLowerCase())) event.preventDefault();
        if (event.key === 'F12') event.preventDefault();
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && ['i', 'j', 'c'].includes(event.key.toLowerCase())) {
          event.preventDefault();
        }
      };
      const preventDefault = (event: Event) => event.preventDefault();

      frameDocument.addEventListener('contextmenu', preventDefault, true);
      frameDocument.addEventListener('dragstart', preventDefault, true);
      frameDocument.addEventListener('selectstart', preventDefault, true);
      frameDocument.addEventListener('keydown', blockKey, true);
      frameWindow.addEventListener('beforeunload', () => frameWindow.clearInterval(intervalId), { once: true });

      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const frameArea = frameAreaRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        nudgeSimulationResize();
        const area = frameAreaRef.current;
        if (area) setFrameArea({ w: area.clientWidth, h: area.clientHeight });
      });
    });
    observer.observe(container);
    if (frameArea) {
      observer.observe(frameArea);
      setFrameArea({ w: frameArea.clientWidth, h: frameArea.clientHeight });
    }

    return () => observer.disconnect();
  }, []);


  useEffect(() => () => clearResizeTimers(), []);

  useEffect(() => {
    setIsLoaded(false);
    setHasError(!normalizedSrc);
    setErrorMessage(normalizedSrc ? '' : 'No Interactive Animation source configured.');
    setUsesParentWatermark(!htmlContent);
  }, [normalizedSrc, htmlContent]);

  useEffect(() => {
    if (!normalizedSrc || isLoaded || hasError) return;
    const timeoutId = window.setTimeout(() => {
      setHasError(true);
      setErrorMessage('The simulation took too long to start. Check the uploaded file and try again.');
    }, 20_000);
    return () => window.clearTimeout(timeoutId);
  }, [normalizedSrc, isLoaded, hasError, reloadKey]);

  useEffect(() => {
    const handleRuntimeMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== 'JEENIE_SIMULATION_ERROR') return;
      setHasError(true);
      setErrorMessage(String(event.data.message || 'The simulation could not start.'));
    };
    window.addEventListener('message', handleRuntimeMessage);
    return () => window.removeEventListener('message', handleRuntimeMessage);
  }, []);

  const retrySimulation = () => {
    setHasError(false);
    setErrorMessage('');
    setIsLoaded(false);
    setReloadKey((value) => value + 1);
  };

  // Live watermark clock
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Blur on tab switch
  useEffect(() => {
    const handleVisibility = () => {
      if (!iframeRef.current) return;
      iframeRef.current.style.filter = document.hidden ? 'blur(20px)' : 'none';
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // DevTools detection (size-diff heuristic). Disable inside /embedded
  // previews because outerWidth/innerWidth compares the host browser to the
  // iframe viewport there, causing false positives that block simulations.
  useEffect(() => {
    const check = () => {
      const isEmbedded = (() => {
        try {
          return window.self !== window.top;
        } catch {
          return true;
        }
      })();

      if (isEmbedded || window.outerWidth <= 0 || window.outerHeight <= 0) {
        setDevtoolsOpen(false);
        return;
      }

      const threshold = 260;
      const widthGap = Math.abs(window.outerWidth - window.innerWidth);
      const heightGap = Math.abs(window.outerHeight - window.innerHeight);
      setDevtoolsOpen(widthGap > threshold || heightGap > threshold);
    };
    check();
    const id = window.setInterval(check, 1200);
    window.addEventListener('resize', check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', check);
    };
  }, []);

  // Block print/save/devtools shortcuts + right-click + selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && ['p', 's', 'u'].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key === 'F12') e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase())) e.preventDefault();
    };
    const noContext = (e: MouseEvent) => e.preventDefault();
    const noDrag = (e: DragEvent) => e.preventDefault();
    window.addEventListener('keydown', handler);
    document.addEventListener('contextmenu', noContext);
    document.addEventListener('dragstart', noDrag);
    return () => {
      window.removeEventListener('keydown', handler);
      document.removeEventListener('contextmenu', noContext);
      document.removeEventListener('dragstart', noDrag);
    };
  }, []);

  const stamp = `${institute} • ${now.toLocaleString()}`;

  return (
    <>
      <style>{`
        @media print {
          .simulation-viewer * { display: none !important; }
          .simulation-viewer::after {
            content: 'Printing is disabled for protected content.';
            display: block;
            font-size: 24px;
            text-align: center;
            margin-top: 200px;
          }
        }
        @keyframes jeenieWatermarkDrift {
          0%   { transform: translate3d(-6%, -4%, 0) rotate(-22deg); }
          50%  { transform: translate3d(4%, 3%, 0) rotate(-22deg); }
          100% { transform: translate3d(-6%, -4%, 0) rotate(-22deg); }
        }
        .jeenie-watermark {
          position: absolute;
          inset: -20%;
          pointer-events: none;
          z-index: 1;
          opacity: 0.035;
          background-image: repeating-linear-gradient(
            -22deg,
            transparent 0 120px,
            rgba(15,23,42,0.001) 120px 121px
          );
          animation: jeenieWatermarkDrift 24s ease-in-out infinite;
          display: flex;
          flex-wrap: wrap;
          gap: 140px 190px;
          padding: 40px;
          align-content: center;
          justify-content: center;
          user-select: none;
          mix-blend-mode: multiply;
        }
        .jeenie-watermark span {
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          font-weight: 600;
          font-size: 13px;

          letter-spacing: 0.08em;
          color: hsl(var(--foreground));
          white-space: nowrap;
        }
        .jeenie-no-select {
          -webkit-user-select: none;
          -ms-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
        }
        .simulation-frame {
          position: relative;
          z-index: 10;
          pointer-events: auto;
          touch-action: auto;
          background: hsl(var(--background));
        }
      `}</style>

      <div
        ref={containerRef}
        className={cn(
          'simulation-viewer jeenie-no-select flex flex-col bg-muted rounded-lg overflow-hidden',
          hideHeader ? 'h-full w-full rounded-none' : isFullscreen ? 'fixed inset-0 z-[100] rounded-none' : 'w-full',
          className
        )}
      >
        {!hideHeader && (
          <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              
              <span className="text-sm font-semibold text-foreground truncate">{title}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={toggleFullscreen} className="h-8 w-8">
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              {onClose && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onClose}
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* iframe area */}
        <div
          className="relative flex-1 min-h-0 isolate"
          style={hideHeader ? undefined : { height: isFullscreen ? 'calc(100dvh - 28px)' : '600px' }}
        >
          {!isLoaded && !hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading Interactive Animation…</p>
            </div>
          )}
          {hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted z-10 text-destructive">
              <AlertTriangle className="h-8 w-8" />
              <p className="max-w-md px-6 text-center text-sm">{errorMessage || 'Failed to load content.'}</p>
              {src && <Button variant="outline" size="sm" onClick={retrySimulation}>Try again</Button>}
            </div>
          )}

          {/* Animated diagonal JEEnie watermark grid */}
          {usesParentWatermark && (
            <div className="jeenie-watermark" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={i}>JEEnie • {stamp}</span>
              ))}
            </div>
          )}

          <iframe
            key={reloadKey}
            ref={iframeRef}
            src={effectiveSrc}
            srcDoc={htmlContent || undefined}
            title={title}
            className="simulation-frame w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals"
            allow="fullscreen; pointer-lock"
            referrerPolicy="no-referrer"
            style={{
              display: 'block',
              transition: 'filter 0.3s ease',
              filter: devtoolsOpen ? 'blur(18px)' : 'none',
            }}
            onLoad={() => {
              setIsLoaded(true);
              const injected = injectWatermarkIntoFrame();
              setUsesParentWatermark(!htmlContent && !injected);
              iframeRef.current?.focus();
              scheduleSimulationResizeNudges();
            }}
            onError={() => {
              setHasError(true);
              setErrorMessage('The simulation file could not be loaded.');
            }}
            onContextMenu={(e) => e.preventDefault()}
          />

          <AnnotationOverlay />

          {devtoolsOpen && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-sm text-center px-6">
              <ShieldAlert className="h-10 w-10 text-destructive" />
              <p className="text-sm font-semibold text-foreground">Developer tools detected</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                For content protection, this simulation is paused while developer tools are open. Please close them to continue.
              </p>
            </div>
          )}
        </div>

        {/* Powered by JEEnie footer strip */}
        <div className="flex items-center justify-between gap-3 px-3 py-1 bg-card/95 border-t border-border text-[10px] text-muted-foreground shrink-0">
          <span className="font-semibold tracking-wide text-foreground/80">Powered by JEEnie</span>
          <span className="truncate opacity-70">© 2026 JEEnie. All Rights Reserved.</span>
        </div>
      </div>
    </>
  );
};

export default SimulationViewer;

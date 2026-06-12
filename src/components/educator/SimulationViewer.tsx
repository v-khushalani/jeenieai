import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2, X, Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import AnnotationOverlay from './AnnotationOverlay';

interface SimulationViewerProps {
  src: string;
  title?: string;
  className?: string;
  onClose?: () => void;
  hideHeader?: boolean;
}

const SimulationViewer: React.FC<SimulationViewerProps> = ({
  src,
  title = 'Virtual Lab',
  className,
  onClose,
  hideHeader = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const normalizedSrc = src.trim();
  const htmlContent = normalizedSrc.startsWith('<') ? src : '';
  const effectiveSrc = htmlContent ? undefined : normalizedSrc || undefined;

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

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Reset loading state when src changes
  useEffect(() => {
    setIsLoaded(false);
    setHasError(!normalizedSrc);
  }, [normalizedSrc]);

  // Blur on tab switch
  useEffect(() => {
    const handleVisibility = () => {
      if (!iframeRef.current) return;
      iframeRef.current.style.filter = document.hidden ? 'blur(20px)' : 'none';
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Block print/save shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 's')) e.preventDefault();
      if (e.key === 'F12') e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c', 'I', 'J', 'C'].includes(e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
      `}</style>

      <div
        ref={containerRef}
        className={cn(
          'simulation-viewer flex flex-col bg-muted rounded-lg overflow-hidden',
          isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'w-full',
          className
        )}
      >
        {!hideHeader && (
          <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground truncate">{title}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleFullscreen}
                className="h-8 w-8"
              >
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
        <div className="relative flex-1 min-h-0" style={{ height: isFullscreen ? 'calc(100vh - 48px)' : (hideHeader ? '100%' : '600px') }}>
          {!isLoaded && !hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading virtual lab content…</p>
            </div>
          )}
          {hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted z-10 text-destructive">
              <AlertTriangle className="h-8 w-8" />
              <p className="text-sm">{src ? 'Failed to load content.' : 'No virtual lab source configured.'}</p>
            </div>
          )}
          <AnnotationOverlay />
          <iframe
            ref={iframeRef}
            src={effectiveSrc}
            srcDoc={htmlContent || undefined}
            title={title}
            className="w-full h-full border-0"
             sandbox="allow-scripts allow-same-origin allow-pointer-lock"
            referrerPolicy="no-referrer"
            style={{ display: 'block', transition: 'filter 0.3s ease' }}
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      </div>
    </>
  );
};

export default SimulationViewer;

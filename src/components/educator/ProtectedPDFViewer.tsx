import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Minimize2, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import AnnotationOverlay from './AnnotationOverlay';
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface ProtectedPDFViewerProps {
  /** Signed URL from Supabase Storage — short-lived, never permanent */
  signedUrl: string;
  /** User email to watermark across each page */
  userEmail?: string;
  /** Title shown in the viewer header */
  title?: string;
  className?: string;
}

const ProtectedPDFViewer: React.FC<ProtectedPDFViewerProps> = ({
  signedUrl,
  userEmail = '',
  title = 'Presentation',
  className,
}) => {
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.4);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // Load PDF from signed URL
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    pdfjsLib
      .getDocument({
        url: signedUrl,
        withCredentials: false,
      })
      .promise.then((doc) => {
        if (cancelled) return;
        setPdf(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError('Failed to load the presentation. Please try again.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [signedUrl]);

  // Render the current page to canvas with watermark
  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!pdf || !canvasRef.current) return;

      // Cancel any in-flight render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      setPageLoading(true);
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderTask = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = renderTask;

        await renderTask.promise;

        // ── Watermark ──────────────────────────────────────────────────────
        if (userEmail) {
          const wmText = `${userEmail} • JEEnie • ${new Date().toLocaleDateString()}`;
          ctx.save();
          ctx.globalAlpha = 0.13;
          ctx.font = `bold ${Math.max(16, viewport.width / 28)}px Arial`;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Canvas API – hex unavoidable
          ctx.textAlign = 'center';

          // Diagonal repeat pattern
          const step = viewport.width * 0.45;
          ctx.translate(viewport.width / 2, viewport.height / 2);
          ctx.rotate(-Math.PI / 6);
          for (let y = -viewport.height; y < viewport.height * 1.5; y += step * 0.6) {
            for (let x = -viewport.width; x < viewport.width * 1.5; x += step) {
              ctx.fillText(wmText, x, y);
            }
          }
          ctx.restore();
        }
        // ──────────────────────────────────────────────────────────────────

        renderTaskRef.current = null;
      } catch (err: unknown) {
        // RenderingCancelledException is fine — page changed mid-render
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
          setError('Failed to render page.');
        }
      } finally {
        setPageLoading(false);
      }
    },
    [pdf, scale, userEmail]
  );

  // Re-render on page or scale change
  useEffect(() => {
    renderPage(currentPage);
  }, [currentPage, renderPage]);

  // Block right-click globally on the canvas
  const blockContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Block keyboard shortcuts that might aid screen capture (PrintScreen, etc.)
  useEffect(() => {
    const blockKeys = (e: KeyboardEvent) => {
      // Block PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
      }
      // Block Ctrl+P (print)
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
      }
      // Block Ctrl+S (save page)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
      }
      // Block DevTools shortcuts
      if (e.key === 'F12') {
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c', 'I', 'J', 'C'].includes(e.key)) {
        e.preventDefault();
      }
    };
    // Blur canvas when tab loses focus to prevent screen capture
    const handleVisibility = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.style.filter = document.hidden ? 'blur(20px)' : 'none';
    };
    window.addEventListener('keydown', blockKeys);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('keydown', blockKeys);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Fullscreen listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const goPrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goNext = () => setCurrentPage((p) => Math.min(totalPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(3, parseFloat((s + 0.2).toFixed(1))));
  const zoomOut = () => setScale((s) => Math.max(0.6, parseFloat((s - 0.2).toFixed(1))));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading presentation…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-destructive">
        <AlertTriangle className="h-8 w-8" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <>
      {/* Print blocker */}
      <style>{`
        @media print {
          .protected-pdf-viewer * { display: none !important; }
          .protected-pdf-viewer::after {
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
          'protected-pdf-viewer flex flex-col bg-slate-800 rounded-lg overflow-hidden select-none',
          isFullscreen ? 'fixed inset-0 z-50 rounded-none' : '',
          className
        )}
        onContextMenu={blockContextMenu}
        // Drag-select prevention
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        {/* ── Top Bar ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900 text-white shrink-0">
          <span className="text-sm font-medium truncate max-w-xs">{title}</span>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={zoomOut}
              disabled={scale <= 0.6}
              className="text-white hover:bg-slate-700 h-8 w-8"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs w-12 text-center">{Math.round(scale * 100)}%</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={zoomIn}
              disabled={scale >= 3}
              className="text-white hover:bg-slate-700 h-8 w-8"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleFullscreen}
              className="text-white hover:bg-slate-700 h-8 w-8"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* ── Canvas Area ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto flex items-start justify-center bg-slate-700 p-4">
          <div className="relative">
            {pageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800/60 z-10">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            )}
            {/* Annotation layer */}
            <AnnotationOverlay />
            <canvas
              ref={canvasRef}
              className="block shadow-2xl rounded"
              style={{ maxWidth: '100%' }}
              onContextMenu={blockContextMenu}
            />
          </div>
        </div>

        {/* ── Bottom Navigation ─────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-4 px-4 py-3 bg-slate-900 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={goPrev}
            disabled={currentPage <= 1}
            className="text-white hover:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
          </Button>
          <span className="text-white text-sm">
            Page {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={goNext}
            disabled={currentPage >= totalPages}
            className="text-white hover:bg-slate-700"
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </>
  );
};

export default ProtectedPDFViewer;

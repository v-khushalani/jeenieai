import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Minus, Plus, FileText, BookOpen, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Document as PdfDoc, Page as PdfPage, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';

// Worker — pin to the version react-pdf actually bundles to avoid mismatch
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

export interface NoteForViewer {
  id: string;
  title: string;
  subtitle?: string | null;
  content_md?: string | null;
  document_url?: string | null;
  document_type?: string | null; // 'markdown' | 'pdf' | 'docx'
  document_name?: string | null;
  document_pages?: number | null;
  reading_time_minutes?: number | null;
}

interface Props {
  note: NoteForViewer;
  trackProgress?: boolean;
  onComplete?: () => void;
}

/** Scrollable document viewer with zoom + per-user resume progress. */
export function DocumentViewer({ note, trackProgress = true, onComplete }: Props) {
  const { user } = useAuth();
  const [zoom, setZoom] = useState(1);
  const [pdfPages, setPdfPages] = useState<number>(note.document_pages || 0);
  const [pdfWidth, setPdfWidth] = useState<number>(680);
  const [currentPage, setCurrentPage] = useState(1);
  const [scrollPct, setScrollPct] = useState(0);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxLoading, setDocxLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef(false);
  const lastSavedRef = useRef<{ page: number; pct: number }>({ page: 0, pct: 0 });

  const type = (note.document_type || (note.document_url ? 'pdf' : 'markdown')) as 'markdown' | 'pdf' | 'docx';

  // Responsive PDF width
  useEffect(() => {
    const measure = () => {
      if (wrapRef.current) setPdfWidth(Math.min(820, wrapRef.current.clientWidth - 32));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Load DOCX → HTML lazily
  useEffect(() => {
    if (type !== 'docx' || !note.document_url) return;
    let cancelled = false;
    setDocxLoading(true);
    (async () => {
      try {
        const [{ default: mammoth }, buf] = await Promise.all([
          import('mammoth/mammoth.browser'),
          fetch(note.document_url!).then((r) => r.arrayBuffer()),
        ]);
        if (cancelled) return;
        const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (!cancelled) setDocxHtml(value);
      } catch (e) {
        logger.error('docx render failed', e);
        if (!cancelled) setDocxHtml('<p class="text-destructive">Could not render document. Try downloading instead.</p>');
      } finally {
        if (!cancelled) setDocxLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [type, note.document_url]);

  // Restore progress
  useEffect(() => {
    if (!trackProgress || !user?.id || restoredRef.current) return;
    restoredRef.current = true;
    (async () => {
      const { data } = await (supabase as any)
        .from('note_reading_progress')
        .select('last_page, last_scroll_pct')
        .eq('user_id', user.id)
        .eq('note_id', note.id)
        .maybeSingle();
      if (!data) return;
      setTimeout(() => {
        if (type === 'pdf' && data.last_page) setCurrentPage(data.last_page);
        if (scrollRef.current && data.last_scroll_pct) {
          const el = scrollRef.current;
          el.scrollTop = (Number(data.last_scroll_pct) / 100) * (el.scrollHeight - el.clientHeight);
        }
      }, 400);
    })();
  }, [trackProgress, user?.id, note.id, type]);

  // Auto-save progress (throttled)
  const saveProgress = useCallback(async (page: number, pct: number, completed = false) => {
    if (!trackProgress || !user?.id) return;
    if (lastSavedRef.current.page === page && Math.abs(lastSavedRef.current.pct - pct) < 5 && !completed) return;
    lastSavedRef.current = { page, pct };
    try {
      await (supabase as any).from('note_reading_progress').upsert({
        user_id: user.id,
        note_id: note.id,
        last_page: page,
        last_scroll_pct: pct,
        completed,
      }, { onConflict: 'user_id,note_id' });
      if (completed) onComplete?.();
    } catch (e) {
      logger.warn('progress save failed', e);
    }
  }, [trackProgress, user?.id, note.id, onComplete]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const pct = max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0;
    setScrollPct(pct);
  }, []);

  // Periodic save
  useEffect(() => {
    if (!trackProgress) return;
    const t = window.setInterval(() => {
      saveProgress(currentPage, scrollPct, scrollPct > 95);
    }, 5000);
    return () => window.clearInterval(t);
  }, [currentPage, scrollPct, saveProgress, trackProgress]);

  // Save on unmount
  useEffect(() => () => { saveProgress(currentPage, scrollPct, scrollPct > 95); }, []); // eslint-disable-line

  const progressLabel = useMemo(() => {
    if (type === 'pdf' && pdfPages) return `Page ${currentPage} of ${pdfPages}`;
    return `${Math.round(scrollPct)}% read`;
  }, [type, currentPage, pdfPages, scrollPct]);

  return (
    <div ref={wrapRef} className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-background/95 backdrop-blur shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{progressLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          {(type === 'pdf' || type === 'docx') && (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}>
                <Minus className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          {note.document_url && (
            <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
              <a href={note.document_url} download={note.document_name || undefined} target="_blank" rel="noreferrer">
                <Download className="w-3.5 h-3.5" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Document body */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto bg-muted/30">
        <article className="max-w-3xl mx-auto my-6 bg-background shadow-lg rounded-md border">
          <div className="px-6 sm:px-8 pt-8 pb-4 border-b">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> JEEnie Study Notes</span>
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] uppercase">{type}</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" /> {note.title}
            </h1>
            {note.subtitle && <p className="text-sm text-muted-foreground mt-1">{note.subtitle}</p>}
          </div>

          <div className="px-4 sm:px-8 py-6">
            {type === 'markdown' && (
              <div className="prose prose-sm dark:prose-invert max-w-none
                prose-headings:font-bold prose-headings:tracking-tight
                prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                prose-strong:text-foreground prose-code:text-primary
                prose-blockquote:border-l-primary prose-blockquote:bg-muted/40 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:not-italic">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content_md || ''}</ReactMarkdown>
              </div>
            )}

            {type === 'pdf' && note.document_url && (
              <div className="flex flex-col items-center" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
                <PdfDoc
                  file={note.document_url}
                  onLoadSuccess={({ numPages }) => setPdfPages(numPages)}
                  loading={<Skeleton className="w-full h-[600px]" />}
                  error={<p className="text-destructive text-sm py-8">Could not load PDF. <a className="underline" href={note.document_url!} target="_blank" rel="noreferrer">Open directly</a>.</p>}
                >
                  {Array.from(new Array(pdfPages || 0), (_, i) => (
                    <div key={`page_${i + 1}`} className="mb-4" data-page={i + 1}>
                      <PdfPage pageNumber={i + 1} width={pdfWidth} renderAnnotationLayer={false} />
                      <div className="text-center text-[10px] text-muted-foreground mt-1">Page {i + 1} / {pdfPages}</div>
                    </div>
                  ))}
                </PdfDoc>
              </div>
            )}

            {type === 'docx' && (
              <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                {docxLoading && <Skeleton className="w-full h-[400px]" />}
                {docxHtml && (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none
                      prose-headings:font-bold prose-strong:text-foreground
                      [&_table]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_td]:border"
                    dangerouslySetInnerHTML={{ __html: docxHtml }}
                  />
                )}
              </div>
            )}
          </div>

          <div className="px-6 sm:px-8 py-4 border-t flex items-center justify-between text-[10px] text-muted-foreground">
            <span>© JEEnie · Curated theory</span>
            <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> Learn smart, solve faster</span>
          </div>
        </article>
      </div>

      {/* Progress bar */}
      {trackProgress && (
        <div className="px-4 py-2 border-t bg-background shrink-0">
          <Progress value={scrollPct} className="h-1" />
        </div>
      )}
    </div>
  );
}

export default DocumentViewer;

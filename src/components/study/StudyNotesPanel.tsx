import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BookOpen, ChevronDown, Network, Sparkles, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  chapterId?: string | null;
  topicId?: string | null;
  note?: any;
  forcePreview?: boolean;
}

/**
 * Branded "Quick Theory" panel shown before student attempts questions.
 * Loads short notes + concept map for current chapter/topic.
 */
export function StudyNotesPanel({ chapterId, topicId, note: presetNote, forcePreview }: Props) {
  const [note, setNote] = useState<any>(presetNote || null);
  const [map, setMap] = useState<any>(null);
  const [open, setOpen] = useState(!!forcePreview);
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    if (presetNote || !chapterId) return;
    (async () => {
      const noteQ = supabase.from('study_notes').select('*').eq('is_published', true).eq('chapter_id', chapterId);
      const mapQ = supabase.from('concept_maps').select('*').eq('is_published', true).eq('chapter_id', chapterId);
      if (topicId) {
        noteQ.eq('topic_id', topicId);
        mapQ.eq('topic_id', topicId);
      }
      const [{ data: ns }, { data: ms }] = await Promise.all([noteQ.limit(1), mapQ.limit(1)]);
      setNote(ns?.[0] || null);
      setMap(ms?.[0] || null);
    })();
  }, [chapterId, topicId, presetNote]);

  if (!note && !map) return null;

  return (
    <>
      <Card className="overflow-hidden border-primary/20">
        {/* Branded gradient header */}
        <div className="bg-gradient-to-r from-primary via-primary/90 to-primary/70 px-4 py-3 text-primary-foreground">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-sm flex items-center gap-2">
                  Theory by JEEnie
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Notes</Badge>
                </div>
                <div className="text-[11px] opacity-90">Quick recap before you solve</div>
              </div>
            </div>
            {note?.reading_time_minutes && (
              <Badge variant="secondary" className="gap-1">
                <Clock className="w-3 h-3" /> {note.reading_time_minutes} min
              </Badge>
            )}
          </div>
        </div>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-muted/50 transition text-left">
              <span className="flex items-center gap-2 text-sm font-medium">
                <BookOpen className="w-4 h-4 text-primary" />
                {note?.title || 'Concept Map Available'}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 py-3 border-t">
              {note && (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content_md}</ReactMarkdown>
                </div>
              )}
              {map && (
                <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setMapOpen(true)}>
                  <Network className="w-3.5 h-3.5" /> View Concept Map
                </Button>
              )}
              <div className="mt-4 pt-3 border-t flex items-center justify-between text-[11px] text-muted-foreground">
                <span>© JEEnie · Curated theory</span>
                <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> Learn smart, solve faster</span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {map && (
        <Dialog open={mapOpen} onOpenChange={setMapOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>{map.title}</DialogTitle></DialogHeader>
            <ConceptMapSvg nodes={map.nodes || []} edges={map.edges || []} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Minimal SVG concept-map renderer */
function ConceptMapSvg({ nodes, edges }: { nodes: any[]; edges: any[] }) {
  const width = 600, height = 400;
  const findNode = (id: string) => nodes.find(n => n.id === id);
  return (
    <div className="w-full overflow-auto bg-muted/20 rounded-md">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {edges.map((e, i) => {
          const a = findNode(e.from), b = findNode(e.to);
          if (!a || !b) return null;
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
              {e.label && (
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} fontSize={10} fill="hsl(var(--muted-foreground))" textAnchor="middle">{e.label}</text>
              )}
            </g>
          );
        })}
        {nodes.map((n, i) => (
          <g key={i}>
            <rect x={n.x - 60} y={n.y - 16} width={120} height={32} rx={8}
              fill={n.color === 'primary' ? 'hsl(var(--primary))' : 'hsl(var(--accent))'} />
            <text x={n.x} y={n.y + 4} fontSize={11} fill="hsl(var(--primary-foreground))" textAnchor="middle" fontWeight="600">{n.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default StudyNotesPanel;

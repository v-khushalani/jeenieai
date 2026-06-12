import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Gamepad2, Link2, Loader2, Play, Search, ShieldCheck, Upload, X } from 'lucide-react';
import { useEducatorContent, EducatorContentItem } from '@/hooks/useEducatorContent';
import { buildHostedSimulationUrl, getSimulationContentKind } from '@/lib/simulationPipeline';
import SimulationViewer from './SimulationViewer';

import { PROGRAM_SUBJECTS } from '@/utils/programConfig';
const SUBJECTS = PROGRAM_SUBJECTS['Class'];

const EducatorGames: React.FC = () => {
  const { items, loading, fetchContent, getSignedUrl } = useEducatorContent();
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItem, setViewerItem] = useState<EducatorContentItem | null>(null);
  const [viewerSrc, setViewerSrc] = useState('');
  const [fullscreenGame, setFullscreenGame] = useState<EducatorContentItem | null>(null);
  const [fullscreenSrc, setFullscreenSrc] = useState('');

  useEffect(() => {
    fetchContent({ content_type: 'game' });
  }, [fetchContent]);

  const filteredItems = useMemo(() => {
    let result = items;

    if (subjectFilter) {
      result = result.filter((item) => item.subject === subjectFilter.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) => item.title.toLowerCase().includes(q) || (item.description ?? '').toLowerCase().includes(q));
    }

    return result;
  }, [items, subjectFilter, searchQuery]);

  const grouped = useMemo(() => {
    const groups: Record<string, EducatorContentItem[]> = {};
    for (const item of filteredItems) {
      if (!groups[item.subject]) groups[item.subject] = [];
      groups[item.subject].push(item);
    }
    return groups;
  }, [filteredItems]);

  const resolveGameSrc = async (item: EducatorContentItem) => {
    if (item.embed_url) {
      return item.embed_url;
    }

    if (!item.file_path) {
      return '';
    }

    const url = await getSignedUrl(item.file_path);
    if (!url) return '';

    const kind = getSimulationContentKind(item.file_path, item.original_filename);
    if (kind === 'script') {
      return buildHostedSimulationUrl(url, item.title);
    }

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return '';
    return await response.text();
  };

  const openWindowed = async (item: EducatorContentItem) => {
    const src = await resolveGameSrc(item);
    if (!src) return;

    setViewerItem(item);
    setViewerSrc(src);
    setViewerOpen(true);
  };

  const openFullscreen = async (item: EducatorContentItem) => {
    const src = await resolveGameSrc(item);
    if (!src) return;

    setFullscreenGame(item);
    setFullscreenSrc(src);
  };

  return (
    <div className="space-y-6">
      {fullscreenGame && (
        <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur-xs flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground truncate">{fullscreenGame.title}</span>
                <Badge className="text-[10px] bg-primary text-primary-foreground hover:bg-primary/90">Game</Badge>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { setFullscreenGame(null); setFullscreenSrc(''); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4 mr-1" /> Exit Fullscreen
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            {fullscreenSrc ? (
              <SimulationViewer src={fullscreenSrc} title={fullscreenGame.title} onClose={() => { setFullscreenGame(null); setFullscreenSrc(''); }} className="h-full" />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center space-y-3">
                  <Gamepad2 className="h-16 w-16 mx-auto text-primary/30" />
                  <p className="text-lg font-medium">Game is loading</p>
                  <p className="text-sm">The uploaded game will appear here when the source is ready.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-foreground">Games</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Uploaded games from admin appear here and launch directly in a secure viewer.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Search games…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Select value={subjectFilter || 'all'} onValueChange={(value) => setSubjectFilter(value === 'all' ? '' : value)}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All subjects" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {SUBJECTS.map((s) => <SelectItem key={s} value={s.toLowerCase()}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Gamepad2 className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">
              {searchQuery || subjectFilter ? 'No games match your search.' : 'No games available yet.'}
            </p>
            <p className="text-xs text-muted-foreground">Ask admin to upload game content in Educator Content Manager.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([subject, games]) => (
            <div key={subject}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{subject.charAt(0).toUpperCase() + subject.slice(1)}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {games.map((item) => (
                  <Card key={item.id} className="hover:shadow-md transition-shadow group">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2 mb-1">
                        {item.embed_url ? (
                          <Badge variant="secondary" className="text-xs gap-1"><Link2 className="h-3 w-3" /> Embedded</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs gap-1"><Upload className="h-3 w-3" /> Uploaded</Badge>
                        )}
                      </div>
                      <CardTitle className="text-sm leading-snug">{item.title}</CardTitle>
                      {item.description && <CardDescription className="text-xs line-clamp-2">{item.description}</CardDescription>}
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex gap-2 mt-2">
                        <Button className="flex-1" variant="outline" onClick={() => openWindowed(item)}>
                          <Play className="h-4 w-4 mr-2" /> Open
                        </Button>
                        <Button className="flex-1 bg-slate-900 border-b-4 border-slate-950 hover:bg-slate-800 hover:border-slate-900 text-white shadow-xs transition-all active:border-b-0 active:translate-y-1 rounded-xl font-bold h-10 px-4" onClick={() => openFullscreen(item)}>
                          <Play className="h-4 w-4 mr-2" /> Launch
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={viewerOpen}
        onOpenChange={(open) => {
          setViewerOpen(open);
          if (!open) setViewerSrc('');
        }}
      >
        <DialogContent className="max-w-5xl w-full p-0 overflow-hidden" style={{ maxHeight: '95vh' }}>
          <DialogHeader className="sr-only">
            <DialogTitle>{viewerItem?.title ?? 'Game'}</DialogTitle>
            <DialogDescription>Game viewer</DialogDescription>
          </DialogHeader>
          {viewerSrc ? (
            <SimulationViewer src={viewerSrc} title={viewerItem?.title ?? 'Game'} onClose={() => { setViewerOpen(false); setViewerSrc(''); }} />
          ) : (
            <div className="flex items-center justify-center h-[500px] text-muted-foreground">
              <div className="text-center space-y-3">
                <Gamepad2 className="h-16 w-16 mx-auto text-primary/30" />
                <p className="text-lg font-medium">Game source unavailable</p>
                <p className="text-sm">Please check the uploaded game file or embed URL.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EducatorGames;
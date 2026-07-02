import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Loader2, FileText, Eye, ChevronDown, ChevronRight,
} from 'lucide-react';
import ProtectedPDFViewer from './ProtectedPDFViewer';
import AnnotationOverlay from './AnnotationOverlay';
import { useEducatorContent, EducatorContentItem } from '@/hooks/useEducatorContent';
import { useAuth } from '@/contexts/AuthContext';

const GRADES = [8, 9, 10, 11, 12];
const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'History', 'Geography', 'Political Science', 'Economics'];

const EducatorChapters: React.FC = () => {
  const { user } = useAuth();
  const { items, loading, fetchContent, getSignedUrl } = useEducatorContent();

  const [gradeFilter, setGradeFilter] = useState<number>(8);
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItem, setViewerItem] = useState<EducatorContentItem | null>(null);
  const [viewerSignedUrl, setViewerSignedUrl] = useState<string>('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchContent({ content_type: 'presentation', grade: gradeFilter });
  }, [gradeFilter, fetchContent]);

  const grouped = React.useMemo(() => {
    const filtered = subjectFilter ? items.filter((i) => i.subject === subjectFilter.toLowerCase()) : items;
    const groups: Record<string, Record<string, EducatorContentItem[]>> = {};
    for (const item of filtered) {
      if (!groups[item.subject]) groups[item.subject] = {};
      const chapterKey = item.chapter_id ?? 'General';
      if (!groups[item.subject][chapterKey]) groups[item.subject][chapterKey] = [];
      groups[item.subject][chapterKey].push(item);
    }
    return groups;
  }, [items, subjectFilter]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const isPdf = (item: EducatorContentItem) => {
    const path = (item.file_path ?? item.original_filename ?? '').toLowerCase();
    return path.endsWith('.pdf');
  };

  const openViewer = async (item: EducatorContentItem) => {
    if (!item.file_path) return;
    const url = await getSignedUrl(item.file_path);
    if (!url) return;
    setViewerItem(item);
    setViewerSignedUrl(url);
    setViewerOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Class Selection */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <p className="text-sm font-semibold text-primary mb-3">Which class are you teaching today?</p>
        <div className="flex flex-wrap gap-2">
          {GRADES.map((g) => (
            <Button key={g} size="default" variant={gradeFilter === g ? 'default' : 'outline'} onClick={() => setGradeFilter(g)} className="h-10 px-5 text-base font-semibold">
              Class {g}
            </Button>
          ))}
        </div>
      </div>

      {/* Subject Filter */}
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium">Subject:</Label>
        <Select value={subjectFilter || 'all'} onValueChange={(v) => setSubjectFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-44 h-8"><SelectValue placeholder="All subjects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {SUBJECTS.map((s) => <SelectItem key={s} value={s.toLowerCase()}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No presentations yet for Class {gradeFilter}.</p>
            <p className="text-xs text-muted-foreground">Ask your admin to upload content.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([subject, chapterMap]) => {
            const subjectKey = `${gradeFilter}-${subject}`;
            const isExpanded = expandedGroups.has(subjectKey);
            return (
              <Card key={subject}>
                <CardHeader className="cursor-pointer select-none" onClick={() => toggleGroup(subjectKey)}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {subject}
                    </CardTitle>
                    <Badge variant="secondary">{Object.values(chapterMap).flat().length} presentations</Badge>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0 space-y-4">
                    {Object.entries(chapterMap).map(([chapterKey, presentations]) => (
                      <div key={chapterKey}>
                        <p className="text-sm font-medium text-muted-foreground mb-2 pl-1">
                          {chapterKey === 'General' ? 'General / Unassigned' : `Chapter: ${chapterKey}`}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {presentations.map((item) => (
                            <Card key={item.id} className="border hover:shadow-md transition-shadow">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm leading-snug">{item.title}</CardTitle>
                                {item.description && <CardDescription className="text-xs line-clamp-2">{item.description}</CardDescription>}
                              </CardHeader>
                              <CardContent className="pt-0">
                                <Button size="sm" className="w-full gap-1" onClick={() => openViewer(item)}>
                                  <Eye className="h-3 w-3" /> Open
                                </Button>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Viewer Dialog */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="w-screen h-screen max-w-none m-0 p-0 overflow-hidden border-0 rounded-none bg-black">
          {viewerItem && isPdf(viewerItem) ? (
            <ProtectedPDFViewer
              signedUrl={viewerSignedUrl}
              userEmail={user?.email}
              title={viewerItem?.title ?? 'Presentation'}
              className="h-[90vh]"
            />
          ) : (
            <div className="relative h-[90vh] bg-muted flex flex-col">
              <div className="px-4 py-2 bg-card border-b border-border text-sm font-medium text-foreground truncate shrink-0">
                {viewerItem?.title ?? 'Presentation'}
              </div>
              <div className="flex-1 relative min-h-0 bg-black overflow-hidden">
                <AnnotationOverlay />
                {/* Expand the bottom by 40px to cut off the native Office Viewer bottom toolbar */}
                <div className="absolute top-0 left-0 right-0 bottom-[-40px]">
                  <iframe
                    src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewerSignedUrl)}`}
                    className="w-full h-full border-0 bg-white"
                  title={viewerItem?.title ?? 'Presentation'}
                  sandbox="allow-scripts allow-same-origin"
                  onContextMenu={(e) => e.preventDefault()}
                />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EducatorChapters;

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { setPickedStartingChapter } from '@/lib/missionEngine';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles } from 'lucide-react';

interface Chapter {
  id: string;
  chapter_name: string | null;
  name: string | null;
  subject: string;
  chapter_number: number | null;
}

interface Props {
  onPicked: () => void;
}

export default function MissionPicker({ onPicked }: Props) {
  const { user } = useAuth();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [subject, setSubject] = useState<string>('');
  const [chapterId, setChapterId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      const { data: prof } = await supabase.from('profiles').select('grade').eq('id', user.id).maybeSingle();
      const grade = (prof as any)?.grade || 11;
      const { data } = await supabase
        .from('chapters')
        .select('id, chapter_name, name, subject, chapter_number')
        .eq('is_active', true)
        .eq('class_level', grade)
        .order('chapter_number', { ascending: true })
        .limit(300);
      setChapters((data || []) as any);
      setLoading(false);
    })();
  }, [user?.id]);

  const subjects = Array.from(new Set(chapters.map((c) => c.subject))).filter(Boolean);
  const filteredChapters = chapters
    .filter((c) => c.subject === subject)
    .sort((a, b) => (a.chapter_number || 0) - (b.chapter_number || 0));

  const handleStart = async () => {
    if (!user?.id || !subject || !chapterId) return;
    const ch = chapters.find((c) => c.id === chapterId);
    if (!ch) return;
    setSaving(true);
    setPickedStartingChapter(user.id, {
      subject,
      chapter: (ch.chapter_name || ch.name || '').trim(),
      chapter_id: ch.id,
    });
    onPicked();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading chapters…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:gap-3">
      <p className="text-xs sm:text-sm text-muted-foreground">
        Pehla mission set karne ke liye subject & chapter chuno. Aage engine khud sambhal lega.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Select value={subject} onValueChange={(v) => { setSubject(v); setChapterId(''); }}>
          <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
          <SelectContent>
            {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={chapterId} onValueChange={setChapterId} disabled={!subject}>
          <SelectTrigger><SelectValue placeholder="Chapter" /></SelectTrigger>
          <SelectContent>
            {filteredChapters.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.chapter_number ? `${c.chapter_number}. ` : ''}{c.chapter_name || c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={handleStart} disabled={!subject || !chapterId || saving} className="w-full sm:w-auto">
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
        Lock my starting chapter
      </Button>
    </div>
  );
}

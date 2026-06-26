// src/components/RoastMemeCard.tsx
// AI-generated roast for the user's weakest topic, shareable as an image.
// Tiny client payload — server owns the prompt, persona roulette, and few-shot.
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Flame, Share2, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';
import ReferralService from '@/services/referralService';
import ShareCardDialog from './ShareCardDialog';
import type { RoastOpts } from '@/lib/shareCard';
import { toast } from 'sonner';
import { sanitizeRoast } from '@/lib/roastUtils';

interface Props {
  weakestTopic: string;
  weakestAccuracy: number;
}

// Wide fallback bank — 5 personas × buckets. Used when the AI call fails
// or the user is offline. {topic}/{acc} get interpolated.
const FALLBACK_BANK: { bucket: 'BRUTAL' | 'HEAVY' | 'MEDIUM' | 'LIGHT' | 'CHEEKY'; line: string }[] = [
  // BRUTAL (<20)
  { bucket: 'BRUTAL', line: "{topic} ne tujhe block kar diya — {acc}% pe seen bhi nahi kar raha 💀" },
  { bucket: 'BRUTAL', line: "Tera {topic} ka score itna kam hai ki periodic table ne bhi tujhe noble gas declare kar diya — reactive zero." },
  { bucket: 'BRUTAL', line: "{topic} aur tu — Newton ne dekha toh bola 'mere laws is par apply nahi karte'." },
  { bucket: 'BRUTAL', line: "{acc}% in {topic}? Bhai ye marks nahi, ek silent cry for help hai 🥲" },
  // HEAVY (20-39)
  { bucket: 'HEAVY', line: "{topic} mein {acc}% — Pushpa hota toh ab tak jhuk gaya hota." },
  { bucket: 'HEAVY', line: "{topic} samjhne ki koshish kar raha tu, par concept ne already left-swipe kar diya." },
  { bucket: 'HEAVY', line: "Rasode mein kaun tha? {topic} ka concept — kyunki tere notes mein toh nahi hai." },
  { bucket: 'HEAVY', line: "Tera {topic} ka prep aur Mumbai local — dono late, dono crowded, dono confusing." },
  // MEDIUM (40-59)
  { bucket: 'MEDIUM', line: "{topic} ke saath teri ekdum situationship — solve karta hai, commit nahi karta. {acc}% ka rishta." },
  { bucket: 'MEDIUM', line: "{acc}% in {topic} — mid-tier hero energy. Sequel mein lead role chahiye toh aur mehnat kar." },
  { bucket: 'MEDIUM', line: "{topic} half-clear hai, jaise YouTube tutorial 2x speed pe — chal raha hai par samajh nahi aaya." },
  // LIGHT (60-79)
  { bucket: 'LIGHT', line: "{acc}% in {topic} — bas ek concept aur mil jaye, tu Sharma ji ke bete ko ratio de dega." },
  { bucket: 'LIGHT', line: "{topic} mein lagbhag-set hai, bas ek careless mistake aur tu padosi ka beta ban jayega 😎" },
  { bucket: 'LIGHT', line: "Optics tu nahi, sirf glasses lagana baaki hai — {topic} ka picture clear ho raha hai." },
  // CHEEKY (80+)
  { bucket: 'CHEEKY', line: "{topic} mein {acc}%? Examiner ko shak hai paper leak hua hai — ek galti karke human prove kar 👀" },
  { bucket: 'CHEEKY', line: "{topic} pe tu itna confident hai ki Newton bhi ab tujhse doubt clear karta hai." },
  { bucket: 'CHEEKY', line: "{acc}% in {topic} — flex band kar, baaki students ko bhi saans lene de bro." },
];

function bucketFor(acc: number): 'BRUTAL' | 'HEAVY' | 'MEDIUM' | 'LIGHT' | 'CHEEKY' {
  if (acc < 20) return 'BRUTAL';
  if (acc < 40) return 'HEAVY';
  if (acc < 60) return 'MEDIUM';
  if (acc < 80) return 'LIGHT';
  return 'CHEEKY';
}

function pickFallback(topic: string, acc: number, exclude: string[]) {
  const b = bucketFor(acc);
  const pool = FALLBACK_BANK.filter(f => f.bucket === b);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (const f of shuffled) {
    const line = f.line.replace(/{topic}/g, topic).replace(/{acc}/g, String(Math.round(acc)));
    if (!exclude.includes(line)) return line;
  }
  return shuffled[0]?.line.replace(/{topic}/g, topic).replace(/{acc}/g, String(Math.round(acc))) || '';
}

const RECENT_KEY = (uid: string) => `jeenie:roast:recent:${uid}`;
function loadRecent(uid: string): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY(uid)) || '[]'); } catch { return []; }
}
function pushRecent(uid: string, line: string) {
  try {
    const cur = loadRecent(uid);
    const next = [line, ...cur.filter(l => l !== line)].slice(0, 3);
    localStorage.setItem(RECENT_KEY(uid), JSON.stringify(next));
  } catch { /* ignore */ }
}

const PERSONA_LABEL: Record<string, string> = {
  bada_bhai: '🧞‍♂️ bada bhai mode',
  brainrot: '💀 brainrot mode',
  desi_aunty: '👵 desi aunty mode',
  sarcastic_prof: '🤓 sarcastic prof mode',
  meme_lord: '🎭 meme lord mode',
};

export const RoastMemeCard = ({ weakestTopic, weakestAccuracy }: Props) => {
  const { user } = useAuth();
  const shareCardEnabled = useFeatureFlag('share_card');
  const [roast, setRoast] = useState<string | null>(null);
  const [persona, setPersona] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareOpts, setShareOpts] = useState<RoastOpts | null>(null);

  const generateRoast = async () => {
    if (!weakestTopic || weakestTopic === 'Not enough data') {
      toast.info('Solve a few more questions first — JEEnie needs ammo to roast!');
      return;
    }
    setLoading(true);
    const exclude = user ? loadRecent(user.id) : [];
    try {
      const { data, error } = await supabase.functions.invoke('jeenie', {
        body: {
          mode: 'roast',
          topic: weakestTopic,
          accuracy: Math.round(weakestAccuracy),
          excludeRoasts: exclude,
        },
      });
      let text = (data?.response || data?.content || '').toString();
      text = sanitizeRoast(text, 240);
      // Strip leading "Topic:" / "<topic>:" / "<topic> —" patterns
      const topicEsc = weakestTopic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`^\\s*(?:topic\\s*:?\\s*)?${topicEsc}\\s*[:\\-—–|]+\\s*`, 'i'), '').trim();
      text = text.replace(/^\s*topic\s*:\s*/i, '').trim();

      if (error || !text || exclude.includes(text)) {
        text = pickFallback(weakestTopic, weakestAccuracy, exclude);
        setPersona(null);
      } else {
        setPersona(data?.persona || null);
      }
      setRoast(text);
      if (user && text) pushRecent(user.id, text);
    } catch {
      const text = pickFallback(weakestTopic, weakestAccuracy, exclude);
      setRoast(text);
      setPersona(null);
      if (user && text) pushRecent(user.id, text);
    } finally {
      setLoading(false);
    }
  };

  const openShare = () => {
    if (!user || !roast) return;
    setShareOpts({
      type: 'roast',
      topic: weakestTopic,
      accuracy: weakestAccuracy,
      roast,
      referralUrl: ReferralService.getReferralLink(user.id),
    });
    setShareOpen(true);
  };

  return (
    <Card className="rounded-xl shadow-xs border border-[#013062]/15 bg-[#e6eeff]">
      <CardContent className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 bg-[#013062] rounded-lg shrink-0">
            <Flame className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[#013062]">JEEnie Roast 💀</h3>
            <p className="text-[11px] text-[#013062]/70">Tera weakest topic — sharp, shareable aur thoda sa savage.</p>
          </div>
          {persona && PERSONA_LABEL[persona] && (
            <span className="text-[9px] font-medium text-[#013062]/70 bg-white/70 border border-[#013062]/15 rounded-full px-2 py-0.5 shrink-0">
              {PERSONA_LABEL[persona]}
            </span>
          )}
        </div>

        {roast ? (
          <div className="bg-white border border-[#013062]/15 rounded-lg p-3 text-sm text-[#013062] mb-3 italic leading-snug">
            "{roast}"
          </div>
        ) : (
          <div className="bg-white/70 border border-dashed border-[#013062]/20 rounded-lg p-3 text-xs text-[#013062]/70 mb-3 text-center">
            Tap below — JEEnie will cook 🔥
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            onClick={generateRoast}
            disabled={loading}
            className="bg-[#013062] text-white hover:bg-[#013062]/90 text-xs"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            {roast ? 'Re-roast' : 'Roast me'}
          </Button>
          {shareCardEnabled && (
            <Button
              size="sm"
              variant="outline"
              disabled={!roast}
              onClick={openShare}
              className="border-[#013062]/20 text-[#013062] hover:bg-white text-xs"
            >
              <Share2 className="h-3.5 w-3.5 mr-1" /> Share
            </Button>
          )}
        </div>
      </CardContent>
      <ShareCardDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        opts={shareOpts}
        shareText="JEEnie ne mujhe roast kar diya 💀"
        filename="jeenie-roast.png"
      />
    </Card>
  );
};

export default RoastMemeCard;

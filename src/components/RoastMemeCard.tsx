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

// Fresh fallback bank — NO stale memes (gormint/binod/silent cry/rasode).
// Used only when the AI call fails or is offline. {topic}/{acc} interpolated.
const FALLBACK_BANK: { bucket: 'BRUTAL' | 'HEAVY' | 'MEDIUM' | 'LIGHT' | 'CHEEKY'; line: string }[] = [
  // BRUTAL (<20)
  { bucket: 'BRUTAL', line: "{topic} mein {acc}% — Google bhi 'did you mean: quit?' pooch raha hai 💀" },
  { bucket: 'BRUTAL', line: "Tera {topic} ka score itna kam hai, formula sheet ne khud unfollow kar diya." },
  { bucket: 'BRUTAL', line: "{topic} tere paas se aise nikla jaise WiFi metro tunnel mein — connection zero." },
  { bucket: 'BRUTAL', line: "{acc}% in {topic}? Bhai calculator ne bhi hisab se mana kar diya." },
  { bucket: 'BRUTAL', line: "{topic} tera dekh ke NCERT ne bola: 'is se better main pdf hi na banta.'" },
  { bucket: 'BRUTAL', line: "Tera {topic} ka arc abhi start bhi nahi hua and finale drop ho gaya 🎬" },
  // HEAVY (20-39)
  { bucket: 'HEAVY', line: "{topic} mein {acc}% — tere prep ka main character energy zero, sidekick bhi resign 🥲" },
  { bucket: 'HEAVY', line: "{topic} ka concept aya, ek selfie li, aur chala gaya — tu bas dekhta reh gaya." },
  { bucket: 'HEAVY', line: "Tera {topic} vs sample paper — heavyweight vs kid, referee ne round 1 mein hi rok diya." },
  { bucket: 'HEAVY', line: "{topic} padha, notes bana, aur exam mein dono se dhoka mila. Betrayal arc." },
  { bucket: 'HEAVY', line: "{acc}% in {topic} — even auto-correct thinks tu galti se yahan aa gaya hai." },
  // MEDIUM (40-59)
  { bucket: 'MEDIUM', line: "{topic} mein {acc}% — kaam chalau energy. Boss level nahi, tutorial level pass." },
  { bucket: 'MEDIUM', line: "{topic} half samjha hai — jaise trailer dekh ke movie ki review likh raha ho." },
  { bucket: 'MEDIUM', line: "{acc}% in {topic}: mid-tier player. Ranked mein climb karna hai toh grind maang raha hai." },
  { bucket: 'MEDIUM', line: "{topic} ke saath tu chal raha hai, par saath mein chal raha hai — aage nahi." },
  { bucket: 'MEDIUM', line: "Tera {topic} 50/50 hai — coin toss se paper de le, same accuracy aayegi 🪙" },
  // LIGHT (60-79)
  { bucket: 'LIGHT', line: "{acc}% in {topic} — bas ek concept aur, aur tu topper group mein forward ho jayega." },
  { bucket: 'LIGHT', line: "{topic} lagbhag lock ho gaya — ek final polish, aur examiner tere fan club mein aa jayega." },
  { bucket: 'LIGHT', line: "{topic} mein {acc}% — 'almost promoted' badge unlock. Next level bas ek push door hai." },
  { bucket: 'LIGHT', line: "Tera {topic} game abhi B+ hai, S-tier tak thodi si mehnat baaki hai 🎮" },
  // CHEEKY (80+)
  { bucket: 'CHEEKY', line: "{topic} mein {acc}%? Sample paper tujhse doubt clear karta hai ab." },
  { bucket: 'CHEEKY', line: "{acc}% in {topic} — itna flex mat kar bhai, baaki candidates ka morale gir raha hai." },
  { bucket: 'CHEEKY', line: "{topic} tere aage aise bhaagta hai jaise CGL ke aspirants form fill karte hai — smooth aur fast." },
  { bucket: 'CHEEKY', line: "Examiner ne {topic} ka question dekh ke bola: 'isko ye toh 5 second mein solve kar dega.'" },
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
    const next = [line, ...cur.filter(l => l !== line)].slice(0, 10);
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

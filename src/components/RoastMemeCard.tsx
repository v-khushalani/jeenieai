// src/components/RoastMemeCard.tsx
// AI-generated roast for the user's weakest topic, shareable as an image.
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

const FALLBACK_ROASTS: Record<string, string[]> = {
  default: [
    "{topic} aur {acc}%? Ye subject nahi, abhi tak to casual rivalry chal rahi hai.",
    "{topic} ne clearly sign kar diya: 'please do not disturb' — {acc}% pe hi lock ho gaya.",
    "{acc}% in {topic}. JEEnie ne bola: progress hai, par confidence abhi attendance mark kar raha hai.",
    "{topic} ko dekhke lagta hai tu padh raha hai, subject ko nahi.",
  ],
};

function pickFallback(topic: string, acc: number) {
  const arr = FALLBACK_ROASTS.default;
  const tpl = arr[Math.floor(Math.random() * arr.length)];
  return tpl.replace('{topic}', topic).replace('{acc}', String(acc));
}

export const RoastMemeCard = ({ weakestTopic, weakestAccuracy }: Props) => {
  const { user } = useAuth();
  const shareCardEnabled = useFeatureFlag('share_card');
  const [roast, setRoast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareOpts, setShareOpts] = useState<RoastOpts | null>(null);

  const generateRoast = async () => {
    if (!weakestTopic || weakestTopic === 'Not enough data') {
      toast.info('Solve a few more questions first — JEEnie needs ammo to roast!');
      return;
    }
    setLoading(true);
    try {
      const prompt = `Write a single sharp, shareable Hinglish roast in JEEnie's voice. Keep it witty, observational, and playful, with fast punchline energy, layered wordplay, and meme-friendly phrasing. Do not imitate any specific comedian or use names. Avoid cruelty, slurs, or humiliation. Topic: "${weakestTopic}", accuracy: ${weakestAccuracy}%. Return only the roast text, max 220 characters.`;
      const { data, error } = await supabase.functions.invoke('jeenie', {
        body: { contextPrompt: prompt, subject: 'roast' },
      });
      let text = data?.response || data?.content || '';
      text = sanitizeRoast(text, 220);
      if (error || !text) text = pickFallback(weakestTopic, weakestAccuracy);
      setRoast(text);
    } catch {
      setRoast(pickFallback(weakestTopic, weakestAccuracy));
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
          <div className="flex-1">
            <h3 className="text-sm font-bold text-[#013062]">JEEnie Roast 💀</h3>
            <p className="text-[11px] text-[#013062]/70">Tera weakest topic — sharp, shareable aur thoda sa savage.</p>
          </div>
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

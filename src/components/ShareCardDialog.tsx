import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Share2, Download, ImageIcon, Loader2 } from 'lucide-react';
import {
  generateShareCard,
  downloadShareCard,
  shareNativeCard,
  type ShareCardOpts,
} from '@/lib/shareCard';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface ShareCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opts: ShareCardOpts | null;
  shareText?: string;
  filename?: string;
}

export const ShareCardDialog = ({
  open,
  onOpenChange,
  opts,
  shareText = 'Beat me on JEEnie 🧞‍♂️',
  filename = 'jeenie-share.png',
}: ShareCardDialogProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastBlobUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !opts) return;
    let cancelled = false;
    setBusy(true);
    generateShareCard(opts)
      .then((blob) => {
        if (cancelled) return;
        if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current);
        const url = URL.createObjectURL(blob);
        lastBlobUrl.current = url;
        setPreviewUrl(url);
      })
      .catch(() => toast.error('Could not generate share image'))
      .finally(() => !cancelled && setBusy(false));
    return () => { cancelled = true; };
  }, [open, opts]);

  useEffect(() => () => {
    if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current);
  }, []);

  const handleShare = async () => {
    if (!opts) return;
    const ok = await shareNativeCard(opts, shareText);
    if (!ok) toast.success('Image downloaded — share it anywhere!');
  };

  const handleDownload = async () => {
    if (!opts) return;
    await downloadShareCard(opts, filename);
    toast.success('Saved! 📥');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border border-[#013062]/15 bg-[#e6eeff] text-[#013062] shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" /> Share your moment
          </DialogTitle>
        </DialogHeader>
        <div className="aspect-square w-full rounded-2xl overflow-hidden flex items-center justify-center border border-white/70 bg-white shadow-inner">
          {busy && !previewUrl ? (
            <Loader2 className="h-8 w-8 animate-spin text-[#013062]" />
          ) : previewUrl ? (
            <img src={previewUrl} alt="JEEnie share card" className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={handleShare} className="bg-[#013062] text-white hover:bg-[#013062]/90">
            <Share2 className="h-4 w-4 mr-1.5" /> Share
          </Button>
          <Button variant="outline" onClick={handleDownload} className="border-[#013062]/20 text-[#013062] hover:bg-white">
            <Download className="h-4 w-4 mr-1.5" /> Download
          </Button>
        </div>
        <p className="text-[11px] text-[#013062]/70 text-center">
          QR + your referral code is baked in — earn Pro/Pro+ when friends join via your link.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default ShareCardDialog;

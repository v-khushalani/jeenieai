import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  X,
  Send,
  Loader2,
  Zap,
  Camera,
  Star,
  Sparkles,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { aiAPI } from "@/services/api/modules/ai";
import { aiQueue } from "@/services/api/queue";
import { renderLatex } from "@/utils/mathRenderer";
import { useAuth } from "@/contexts/AuthContext";
import PricingModal from "@/components/PricingModal";
import type { JeenieMode } from "@/services/api/types";
import { motion, AnimatePresence } from "framer-motion";
import { useDraggable } from "@/hooks/useDraggable";

import jeenieMascot from '@/assets/jeenie-mascot.png';

import 'katex/dist/katex.min.css';

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  imageUrl?: string;
  upgradeTo?: 'pro' | 'pro_plus' | null;
}

interface AIDoubtSolverProps {
  question?: {
    question: string;
    option_a?: string;
    option_b?: string;
    option_c?: string;
    option_d?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  isCurrentAnswered?: boolean;
}

const AIDoubtSolver: React.FC<AIDoubtSolverProps> = ({
  question,
  isOpen,
  onClose,
  isCurrentAnswered = false,
}) => {
  const { user, subscriptionTier } = useAuth();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingRequiredTier, setPricingRequiredTier] = useState<'pro' | 'pro_plus'>('pro');
  const [internalOpen, setInternalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [internalIsDragging, setInternalIsDragging] = useState(false);

  const { position, onMouseDown } = useDraggable({ x: 0, y: 0 });

  useEffect(() => {
    if (isOpen) setInternalOpen(true);
  }, [isOpen]);

  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const initialMessage = useMemo(() => {
    const isGeneral = !question?.option_a || question?.question?.includes("koi bhi");
    if (isGeneral) {
      return `<div class="p-1"><p class="font-bold text-lg mb-2 text-[#013062]">Oye! 👋</p><p class="text-slate-600 leading-relaxed">Bol, kya dikkat aa rahi hai? Sharmayiye mat, khul ke puchiye! 😉</p></div>`;
    } else {
      const options = [
        question.option_a && `A) ${escapeHtml(question.option_a)}`,
        question.option_b && `B) ${escapeHtml(question.option_b)}`,
        question.option_c && `C) ${escapeHtml(question.option_c)}`,
        question.option_d && `D) ${escapeHtml(question.option_d)}`,
      ].filter(Boolean).join('<br>');

      return `
<div class="space-y-4">
  <div class="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50 text-[13px] font-medium text-slate-800 shadow-inner">
    <p class="mb-2 font-bold text-[#013062]">${escapeHtml(question.question)}</p>
    <div class="space-y-1.5 opacity-90">${options}</div>
  </div>
  <p class="text-[14.5px] font-medium text-slate-700">Isme kya phas raha hai? Logic samjhaun ya full solution chahiye? 😉</p>
</div>`;
    }
  }, [question]);

  useEffect(() => {
    if (internalOpen && messages.length === 0) {
      setMessages([{ role: "assistant", content: initialMessage, timestamp: new Date().toISOString() }]);
    }
  }, [internalOpen, messages.length, initialMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Image 5MB se chhota hona chahiye! 📸");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setImageBase64(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImagePreview(null);
    setImageBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSendMessage = async (overrideInput?: string, explicitMode?: JeenieMode) => {
    const effectiveInput = (overrideInput ?? input).trim();
    if (!effectiveInput && !imageBase64) return;
    setError(null);

    if (!user) {
      setError("Pehle login kar yaar! 🔑");
      return;
    }

    setLoading(true);
    const userMsg: Message = { 
      role: "user", 
      content: effectiveInput || "📸 Photo", 
      imageUrl: imagePreview || undefined,
      timestamp: new Date().toISOString() 
    };
    setMessages((prev) => [...prev, userMsg]);
    
    const currentImage = imageBase64;
    setInput("");
    clearImage();

    try {
      const isGeneral = !question?.option_a || question?.question?.includes("koi bhi");
      const history = messages.slice(-10).map(m => ({ 
        role: m.role, 
        content: m.content.replace(/<[^>]*>/g, ' ').trim(),
        timestamp: m.timestamp
      }));
      
      let prompt: string;
      if (currentImage) prompt = `Image doubt: ${effectiveInput || "Analyze this image"}`;
      else if (isGeneral) prompt = userMsg.content;
      else prompt = `Question: ${question.question}\nStudent says: ${userMsg.content}`;

      setTyping(true);
      const { data, error: apiError } = await aiAPI.askJeenie({
        contextPrompt: prompt,
        mode: explicitMode || 'auto',
        conversationHistory: history,
        image: currentImage || undefined
      });

      if (apiError) throw new Error(apiError.message);
      
      const formatted = cleanAndFormatJeenieText(data.response);
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: formatted,
        timestamp: new Date().toISOString(),
        upgradeTo: data.quota_exhausted ? (data.upgrade_to ?? 'pro') : undefined,
      }]);

      if (data.quota_exhausted) {
        setPricingRequiredTier(data.upgrade_to || 'pro');
        setPricingOpen(true);
      }
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Oho! Kuch gadbad ho gayi. Ek baar phir pooch?", timestamp: new Date().toISOString() }]);
    } finally {
      setTyping(false);
      setLoading(false);
    }
  };

  // Logged-in users only — prevents anonymous credit burn on public pages
  if (!user) return null;

  return (
    <>
      {/* Floating Trigger */}
      <div 
        className="fixed z-[9999] pointer-events-none"
        style={{
          right: '16px',
          bottom: 'calc(var(--app-mobile-nav-height, 0px) + 24px)',
          transform: `translate(${-position.x}px, ${-position.y}px)`,
        }}
      >
        <motion.div
          drag
          dragMomentum={false}
          onDragStart={() => setInternalIsDragging(true)}
          onDragEnd={() => setTimeout(() => setInternalIsDragging(false), 50)}
          className="pointer-events-auto cursor-grab active:cursor-grabbing relative"
        >
          <AnimatePresence>
            {!internalOpen && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                whileHover={{ scale: 1.08, y: -4 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                onClick={() => !internalIsDragging && setInternalOpen(true)}
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#013062] flex items-end justify-center shadow-[0_12px_40px_rgba(1,48,98,0.45)] ring-2 ring-white/40 hover:ring-4 hover:ring-blue-300/50 relative group transition-[opacity,box-shadow] duration-300 ${!isCurrentAnswered ? 'opacity-60 hover:opacity-100' : 'opacity-100'}`}
              >
                <img
                  src={jeenieMascot}
                  alt="JEEnie"
                  loading="lazy"
                  width={1024}
                  height={1024}
                  className={`w-[44px] h-[44px] sm:w-[52px] sm:h-[52px] object-contain object-bottom drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)] pointer-events-none ${loading || typing ? 'animate-bounce' : ''}`}
                />

                {/* Side Tag */}
                <div className="hidden sm:block absolute -left-28 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-apple-md text-[12px] font-bold text-[#013062] border border-blue-100/50 whitespace-nowrap opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all pointer-events-none">
                  Stuck? Pooch le! 👋
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>
      </div>

      {/* Backdrop Blur for Modal Feel */}
      <AnimatePresence>
        {internalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setInternalOpen(false); onClose(); }}
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[9999]"
          />
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {internalOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 40, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.9, y: 40, filter: 'blur(10px)' }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 top-[12vh] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[400px] sm:h-[76%] max-h-[100dvh] sm:max-h-[720px] bg-white/95 backdrop-blur-3xl rounded-t-[28px] sm:rounded-[32px] shadow-[0_60px_160px_-40px_rgba(0,0,0,0.38)] z-[10000] flex flex-col overflow-hidden border border-white/60 ring-1 ring-black/5"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100/80 bg-white/60 flex items-center justify-between cursor-default">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[14px] bg-gradient-to-br from-[#013062] to-[#024080] flex items-end justify-center overflow-hidden shadow-md shadow-blue-900/20 ring-4 ring-blue-50">
                  <img src={jeenieMascot} alt="JEEnie" loading="lazy" width={1024} height={1024} className="w-8 h-8 object-contain object-bottom" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-[17px] tracking-tight leading-tight">JEEnie</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-[10px] text-slate-500 font-bold tracking-wider uppercase">Online</p>
                  </div>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => { setInternalOpen(false); onClose(); }} 
                className="w-9 h-9 rounded-full hover:bg-slate-100/80 text-slate-400 hover:text-slate-600 transition-all"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>


            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 bg-gradient-to-b from-[#F8FAFC] to-white custom-scrollbar">
              {messages.map((msg, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  key={i} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[88%] min-w-0 overflow-hidden px-4 py-3.5 rounded-[20px] text-[14.5px] leading-relaxed shadow-sm transition-all ${
                    msg.role === 'user' 
                      ? 'bg-[#013062] text-white rounded-br-md shadow-[0_8px_24px_-8px_rgba(1,48,98,0.3)] font-medium' 
                      : 'bg-white border border-slate-100 text-slate-800 rounded-bl-md shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)]'
                  }`}>
                    {msg.imageUrl && (
                      <div className="mb-4 overflow-hidden rounded-2xl ring-1 ring-black/5">
                        <img src={msg.imageUrl} className="w-full h-auto object-cover" />
                      </div>
                    )}
                    <div
                      className="prose prose-sm max-w-none prose-slate font-medium break-words [overflow-wrap:anywhere] [&_.katex-display]:overflow-x-auto [&_.katex-display]:max-w-full [&_.katex]:whitespace-normal [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto [&_img]:max-w-full"
                      dangerouslySetInnerHTML={{ __html: msg.content }}
                    />
                  </div>
                </motion.div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 p-4 rounded-2xl rounded-tl-none flex gap-1.5 items-center shadow-sm">
                    <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 bg-blue-600/40 rounded-full" />
                    <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 bg-blue-600/60 rounded-full" />
                    <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 bg-blue-600/80 rounded-full" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Action Chips */}
            <AnimatePresence>
              {messages.length === 1 && !loading && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="px-4 pb-1 flex gap-2 overflow-x-auto no-scrollbar"
                >
                  <button onClick={() => handleSendMessage(question?.option_a ? "Intuition samjha do" : "Concept intuition se samjha do", "deep")} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-full border border-emerald-100 hover:bg-emerald-100 transition-all whitespace-nowrap">
                    <Sparkles size={11} /> Desi Logic
                  </button>
                  <button onClick={() => handleSendMessage("Step-by-step solution chahiye", "steps")} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-full border border-blue-100 hover:bg-blue-100 transition-all whitespace-nowrap">
                    <Star size={11} /> Step-by-Step
                  </button>
                  <button onClick={() => handleSendMessage("Short tip aur common trap batao", "quick")} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-[11px] font-bold rounded-full border border-amber-100 hover:bg-amber-100 transition-all whitespace-nowrap">
                    <Zap size={11} /> Quick Tip
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Area */}
            <div className="px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-4 bg-white border-t border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              {error && (
                <p className="mb-2 text-[12px] font-semibold text-red-500">{error}</p>
              )}
              {imagePreview && (
                <div className="mb-3 relative inline-block animate-in fade-in zoom-in-90">
                  <img src={imagePreview} className="w-20 h-20 rounded-xl object-cover border-4 border-white shadow-lg ring-1 ring-black/5" />
                  <button onClick={clearImage} className="absolute -top-2.5 -right-2.5 bg-red-500 text-white rounded-full p-1 shadow-lg hover:scale-110 transition-transform ring-2 ring-white">
                    <X size={12} />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <input type="file" hidden ref={fileInputRef} accept="image/*" onChange={handleImageUpload} />
                <Button 
                  type="button"
                  variant="ghost" 
                  size="icon" 
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 w-11 h-11 rounded-xl bg-slate-50 text-slate-400 hover:text-[#013062] hover:bg-blue-50 transition-all border border-slate-100"
                >
                  <Camera size={20} />
                </Button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Kuch bhi poochho..."
                  className="flex-1 min-w-0 h-11 bg-slate-50 border border-slate-100 focus:border-[#013062] focus:bg-white focus:ring-4 focus:ring-blue-50/50 rounded-xl px-4 text-[14.5px] transition-all placeholder:text-slate-400 outline-none font-medium"
                />
                <Button 
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={loading}
                  className="w-11 h-11 rounded-xl bg-[#013062] hover:bg-[#024080] shrink-0 shadow-lg shadow-blue-900/20 transition-all active:scale-90 disabled:opacity-40 disabled:scale-100"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send size={18} className="ml-0.5" />}
                </Button>
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      <PricingModal
        isOpen={pricingOpen}
        onClose={() => setPricingOpen(false)}
        requiredTier={pricingRequiredTier}
      />
    </>
  );
};

function cleanAndFormatJeenieText(text: string): string {
  if (!text) return "";

  let formatted = text.trim();

  // 0. Remove "Bhai" or "Bada Bhai" mentions if they slipped through
  formatted = formatted.replace(/\b(bada bhai|mentor|bhai)\b/gi, "JEEnie");
  
  // 1. Ensure bold formatting for specific Hinglish markers
  formatted = formatted.replace(/(Oye!)/g, '<span class="text-[#013062] font-black text-lg">$1</span>');
  
  // 2. Highlight analogies or key insights
  formatted = formatted.replace(/(Logic:)/gi, '<strong class="text-[#013062]">$1</strong>');
  formatted = formatted.replace(/(Shortcut:)/gi, '<strong class="text-emerald-600">$1</strong>');
  formatted = formatted.replace(/(Trap Alert ⚠️:)/gi, '<strong class="text-amber-600">$1</strong>');
  
  // 3. Convert bold markdown to our specific class
  formatted = formatted
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[#013062] font-extrabold">$1</strong>');

  // 4. Handle Display Math ($$ ... $$)
  formatted = formatted.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => {
    return `<div class="my-6 flex justify-center overflow-x-auto max-w-full py-4 bg-slate-50/80 rounded-2xl border border-slate-200/50 shadow-inner text-lg">${renderLatex(`$$${latex.trim()}$$`)}</div>`;
  });

  // 5. Handle Inline Math ($ ... $)
  formatted = formatted.replace(/(?<!\d)\$([^$]+?)\$/g, (full, latex) => {
    if (/^\s*\d+(\.\d+)?\s*$/.test(latex)) return full;
    return `<span class="inline-math px-1.5 py-0.5 bg-blue-50/30 rounded-md font-medium text-[#013062]">${renderLatex(`$${latex.trim()}$`)}</span>`;
  });

  // 6. Basic formatting (bullets, line breaks)
  formatted = formatted
    .replace(/\n{2,}/g, '<div class="h-4"></div>')
    .replace(/\n/g, '<br/>')
    .replace(/\* (.*?)(?=<br\/>|$)/g, '<div class="flex gap-2 items-start py-0.5"><span class="text-[#013062] mt-1.5 w-1.5 h-1.5 rounded-full bg-[#013062] shrink-0"></span><span>$1</span></div>');
  
  return formatted;
}

export default AIDoubtSolver;
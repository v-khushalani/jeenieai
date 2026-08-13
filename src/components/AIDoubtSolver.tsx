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

import 'katex/dist/katex.min.css';

interface Message {
  role: "user" | "assistant";
  content: string;
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
  const { subscriptionTier } = useAuth();
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
  <p class="text-[14.5px] font-medium text-slate-700">Bata, isme kya phas raha hai? Logic samjhaun ya full solution chahiye? 😉</p>
</div>`;
    }
  }, [question]);

  useEffect(() => {
    if (internalOpen && messages.length === 0) {
      setMessages([{ role: "assistant", content: initialMessage }]);
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Pehle login kar bhai! 🔑");
      return;
    }

    setLoading(true);
    const userMsg: Message = { role: "user", content: effectiveInput || "📸 Photo", imageUrl: imagePreview || undefined };
    setMessages((prev) => [...prev, userMsg]);
    
    const currentImage = imageBase64;
    setInput("");
    clearImage();

    try {
      const isGeneral = !question?.option_a || question?.question?.includes("koi bhi");
      const history = messages.slice(-10).map(m => ({ 
        role: m.role, 
        content: m.content.replace(/<[^>]*>/g, ' ').trim() 
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
        upgradeTo: data.quota_exhausted ? (data.upgrade_to ?? 'pro') : undefined,
      }]);

      if (data.quota_exhausted) {
        setPricingRequiredTier(data.upgrade_to || 'pro');
        setPricingOpen(true);
      }
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Oho! Kuch gadbad ho gayi. Ek baar phir pooch?" }]);
    } finally {
      setTyping(false);
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Trigger */}
      <div 
        className="fixed z-[9999] pointer-events-none"
        style={{ right: '24px', bottom: '100px', transform: `translate(${-position.x}px, ${-position.y}px)` }}
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
                initial={{ scale: 0, opacity: 0, rotate: -20 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0, opacity: 0, rotate: 20 }}
                whileHover={{ scale: 1.05 }}
                onClick={() => !internalIsDragging && setInternalOpen(true)}
                className={`w-16 h-16 rounded-full bg-[#013062] flex items-center justify-center shadow-[0_12px_40px_rgba(1,48,98,0.45)] border-2 border-white/30 relative overflow-hidden group transition-all duration-300 ${!isCurrentAnswered ? 'opacity-40 hover:opacity-100' : 'opacity-100'}`}
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/30 to-transparent animate-pulse" />
                <Zap className={`w-8 h-8 text-white transition-transform group-hover:scale-110 group-active:scale-90 ${loading || typing ? 'animate-pulse' : ''}`} fill="currentColor" />
                
                {/* Visual Glow */}
                <div className="absolute inset-0 bg-blue-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                
                {/* Side Tag */}
                <div className="absolute -left-28 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-apple-md text-[12px] font-bold text-[#013062] border border-blue-100/50 whitespace-nowrap opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all pointer-events-none">
                  Stuck? Pooch le! 👋
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Chat Window */}
      <AnimatePresence>
        {internalOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 40, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.9, y: 40, filter: 'blur(10px)' }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-4 bottom-4 top-4 sm:inset-auto sm:right-8 sm:bottom-28 sm:w-[440px] sm:h-[700px] bg-white/95 backdrop-blur-2xl rounded-[32px] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.25)] z-[10000] flex flex-col overflow-hidden border border-white/60 ring-1 ring-black/5"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100/80 bg-white/50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-[18px] bg-gradient-to-br from-[#013062] to-[#024080] flex items-center justify-center shadow-lg shadow-blue-900/20 ring-4 ring-blue-50">
                  <Zap className="w-6 h-6 text-white" fill="currentColor" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 flex items-center gap-2 text-xl tracking-tight">
                    JEEnie
                    <span className="text-[10px] bg-[#013062] text-white px-2.5 py-1 rounded-full font-black tracking-widest uppercase shadow-sm">MENTOR</span>
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-[11px] text-slate-500 font-bold tracking-wider uppercase">Always here for you</p>
                  </div>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => { setInternalOpen(false); onClose(); }} 
                className="w-10 h-10 rounded-full hover:bg-slate-100/80 text-slate-400 hover:text-slate-600 transition-all"
              >
                <X className="w-6 h-6" />
              </Button>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-[#F8FAFC] to-white custom-scrollbar">
              {messages.map((msg, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  key={i} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[90%] p-5 rounded-[26px] text-[15px] leading-relaxed shadow-sm transition-all ${
                    msg.role === 'user' 
                      ? 'bg-[#013062] text-white rounded-tr-none shadow-[0_8px_24px_-8px_rgba(1,48,98,0.3)] font-medium' 
                      : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)]'
                  }`}>
                    {msg.imageUrl && (
                      <div className="mb-4 overflow-hidden rounded-2xl ring-1 ring-black/5">
                        <img src={msg.imageUrl} className="w-full h-auto object-cover" />
                      </div>
                    )}
                    <div className="prose prose-sm max-w-none prose-slate font-medium" dangerouslySetInnerHTML={{ __html: msg.content }} />
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
              {messages.length === 1 && question?.option_a && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-6 py-2 flex gap-3 overflow-x-auto no-scrollbar"
                >
                  <button onClick={() => handleSendMessage("Intuition samjha do", "deep")} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100 hover:bg-emerald-100 transition-all whitespace-nowrap">
                    <Sparkles size={12} /> Desi Logic
                  </button>
                  <button onClick={() => handleSendMessage("Full Solution chahiye", "steps")} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 text-xs font-bold rounded-full border border-blue-100 hover:bg-blue-100 transition-all whitespace-nowrap">
                    <Star size={12} /> Step-by-Step
                  </button>
                  <button onClick={() => handleSendMessage("Short Tip/Trap?", "quick")} className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 text-xs font-bold rounded-full border border-amber-100 hover:bg-amber-100 transition-all whitespace-nowrap">
                    <Zap size={12} /> Quick Tip
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Area */}
            <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              {imagePreview && (
                <div className="mb-4 relative inline-block animate-in fade-in zoom-in-90">
                  <img src={imagePreview} className="w-24 h-24 rounded-2xl object-cover border-4 border-white shadow-xl ring-1 ring-black/5" />
                  <button onClick={clearImage} className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow-lg hover:scale-110 transition-transform ring-2 ring-white">
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-3">
                <input type="file" hidden ref={fileInputRef} accept="image/*" onChange={handleImageUpload} />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 hover:text-[#013062] hover:bg-blue-50 transition-all border border-slate-100"
                >
                  <Camera size={24} />
                </Button>
                <div className="flex-1 relative">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Kuch poocho bhai..."
                    className="w-full bg-slate-50 border border-slate-100 focus:border-[#013062] focus:bg-white focus:ring-4 focus:ring-blue-50/50 rounded-2xl px-5 py-3.5 text-[15px] transition-all placeholder:text-slate-400 outline-none font-medium"
                  />
                </div>
                <Button 
                  onClick={() => handleSendMessage()}
                  disabled={loading || (!input.trim() && !imageBase64)}
                  className="w-12 h-12 rounded-2xl bg-[#013062] hover:bg-[#024080] shrink-0 shadow-xl shadow-blue-900/20 transition-all active:scale-90 disabled:opacity-40 disabled:scale-100"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send size={22} className="ml-0.5" />}
                </Button>
              </div>
              <p className="text-center text-[10px] text-slate-400 mt-4 font-bold tracking-widest uppercase">Expert Mentor • AI Powered</p>
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
  let formatted = text.trim();
  
  // 1. Convert bold markdown to our specific class
  formatted = formatted
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[#013062] font-extrabold">$1</strong>');

  // 2. Handle Display Math ($$ ... $$)
  formatted = formatted.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => {
    return `<div class="my-4 flex justify-center overflow-x-auto py-2 bg-blue-50/30 rounded-xl border border-blue-100/50">${renderLatex(`$$${latex.trim()}$$`)}</div>`;
  });

  // 3. Handle Inline Math ($ ... $)
  formatted = formatted.replace(/(?<!\d)\$([^$]+?)\$/g, (full, latex) => {
    if (/^\s*\d+(\.\d+)?\s*$/.test(latex)) return full;
    return `<span class="inline-math px-0.5">${renderLatex(`$${latex.trim()}$`)}</span>`;
  });

  // 4. Convert newlines to breaks
  formatted = formatted
    .replace(/\n{2,}/g, '<div class="h-4"></div>')
    .replace(/\n/g, '<br>');
  
  return formatted;
}

export default AIDoubtSolver;
import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  X,
  Send,
  Loader2,
  AlertCircle,
  Zap,
  Clock,
  Camera,
  Star,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { aiAPI } from "@/services/api/modules/ai";
import { aiQueue } from "@/services/api/queue";
import { logger } from "@/utils/logger";
import { renderLatex, containsLatex } from "@/utils/mathRenderer";
import { useAuth } from "@/contexts/AuthContext";
import PricingModal from "@/components/PricingModal";
import type { JeenieMode, JeenieModeSource } from "@/services/api/types";
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
  const [lastRequestTime, setLastRequestTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingRequiredTier, setPricingRequiredTier] = useState<'pro' | 'pro_plus'>('pro');
  const [internalOpen, setInternalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { position, isDragging, onMouseDown } = useDraggable({ x: 0, y: 0 });

  const isAIAvailable = useMemo(() => aiAPI.isAvailable(), []);

  useEffect(() => {
    if (isOpen) setInternalOpen(true);
  }, [isOpen]);

  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        const stats = aiQueue.getStats();
        setQueuePosition(stats.queueLength > 0 ? stats.queueLength : null);
      }, 2000);
      return () => clearInterval(interval);
    } else {
      setQueuePosition(null);
    }
  }, [loading]);

  const initialMessage = useMemo(() => {
    const isGeneral = !question?.option_a || question?.question?.includes("koi bhi");
    if (isGeneral) {
      return `<div class="p-1"><p class="font-bold text-base mb-1">Oye! 👋</p><p>Bol, kya dikkat aa rahi hai? Sharmayiye mat, khul ke puchiye! 😉</p></div>`;
    } else {
      const options = [
        question.option_a && `A) ${escapeHtml(question.option_a)}`,
        question.option_b && `B) ${escapeHtml(question.option_b)}`,
        question.option_c && `C) ${escapeHtml(question.option_c)}`,
        question.option_d && `D) ${escapeHtml(question.option_d)}`,
      ].filter(Boolean).join('<br>');

      return `
<div class="space-y-3">
  <div class="bg-white/50 p-3 rounded-xl border border-blue-100/50 text-xs font-medium text-slate-800">
    <p class="mb-2 font-bold">${escapeHtml(question.question)}</p>
    <div class="space-y-1 opacity-80">${options}</div>
  </div>
  <p class="text-sm font-medium">Bata, isme kya phas raha hai? Short logic chahiye toh bata, sab solve kar lenge! 😉</p>
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
  }, [messages]);

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

  const buildConversationHistory = (currentMessages: Message[]) => {
    const recent = currentMessages.slice(-16);
    return recent
      .map((msg) => ({
        role: msg.role,
        content: msg.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200),
        timestamp: new Date().toISOString(),
      }))
      .filter((m) => m.content.length > 0);
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
      const history = buildConversationHistory(messages);
      let prompt: string;
      
      if (currentImage) {
        prompt = `Image doubt: ${effectiveInput || "Analyze this image"}`;
      } else if (isGeneral) {
        prompt = userMsg.content;
      } else {
        prompt = `Question: ${question.question}\nStudent says: ${userMsg.content}`;
      }

      setTyping(true);
      const { data, error: apiError } = await aiAPI.askJeenie({
        contextPrompt: prompt,
        mode: explicitMode || 'auto',
        conversationHistory: history,
        image: currentImage || undefined
      });

      if (apiError) throw new Error(apiError.message);
      
      const formatted = cleanAndFormatJeenieText(data.response, false);
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
      {/* Floating Button */}
      <div 
        className="fixed z-[9999] pointer-events-none"
        style={{ right: '24px', bottom: '100px' }}
      >
        <motion.div
          drag
          dragMomentum={false}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={() => setTimeout(() => setIsDragging(false), 50)}
          className="pointer-events-auto cursor-grab active:cursor-grabbing relative"
        >
          <AnimatePresence>
            {!internalOpen && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                whileHover={{ scale: 1.1 }}
                onClick={() => !isDragging && setInternalOpen(true)}
                className={`w-16 h-16 rounded-full bg-[#013062] flex items-center justify-center shadow-[0_8px_32px_rgba(1,48,98,0.4)] border-2 border-white/20 relative overflow-hidden group transition-opacity duration-300 ${!isCurrentAnswered ? 'opacity-40 hover:opacity-100' : 'opacity-100'}`}
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/20 to-transparent" />
                <Zap className={`w-7 h-7 text-white transition-transform group-hover:scale-110 ${loading || typing ? 'animate-pulse' : ''}`} fill="currentColor" />
                
                {/* Visual Highlight Ring */}
                <div className="absolute inset-0 border-2 border-blue-400/30 rounded-full animate-ping pointer-events-none" />
                
                {/* Floating "Stuck?" label */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white px-3 py-1 rounded-full shadow-md text-[10px] font-bold text-blue-900 border border-blue-100 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  Stuck? Pooch le!
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Main Chat Window */}
      <AnimatePresence>
        {internalOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-x-4 bottom-4 top-4 sm:inset-auto sm:right-6 sm:bottom-24 sm:w-[400px] sm:h-[600px] bg-white rounded-[32px] shadow-[0_32px_120px_rgba(0,0,0,0.15)] z-[10000] flex flex-col overflow-hidden border border-slate-100"
          >
            {/* Header */}
            <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#013062] flex items-center justify-center shadow-inner">
                  <Zap className="w-5 h-5 text-white" fill="currentColor" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 flex items-center gap-1.5">
                    JEEnie
                    <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-black tracking-widest">BHAI</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">Always here for you</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setInternalOpen(false); onClose(); }} className="rounded-full hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </Button>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30 custom-scrollbar">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-[#013062] text-white rounded-br-none' 
                      : 'bg-white border border-slate-100 text-slate-800 rounded-bl-none'
                  }`}>
                    {msg.imageUrl && <img src={msg.imageUrl} className="rounded-lg mb-2 max-h-48 w-full object-cover" />}
                    <div className="prose prose-sm max-w-none prose-slate" dangerouslySetInnerHTML={{ __html: msg.content }} />
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-bl-none flex gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Action Chips */}
            {messages.length === 1 && question?.option_a && (
              <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar">
                <Button variant="outline" size="sm" onClick={() => handleSendMessage("Sirf Answer batao", "quick")} className="rounded-full text-[11px] font-bold border-emerald-100 bg-emerald-50/30 text-emerald-700 hover:bg-emerald-50">Sirf Answer</Button>
                <Button variant="outline" size="sm" onClick={() => handleSendMessage("Full Solution chahiye", "steps")} className="rounded-full text-[11px] font-bold border-blue-100 bg-blue-50/30 text-blue-700 hover:bg-blue-50">Solution</Button>
                <Button variant="outline" size="sm" onClick={() => handleSendMessage("Formula kya hai?", "quick")} className="rounded-full text-[11px] font-bold border-amber-100 bg-amber-50/30 text-amber-700 hover:bg-amber-50">Formula</Button>
              </div>
            )}

            {/* Input */}
            <div className="p-4 bg-white border-t">
              {imagePreview && (
                <div className="mb-3 relative inline-block">
                  <img src={imagePreview} className="w-16 h-16 rounded-xl object-cover border" />
                  <button onClick={clearImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-md">
                    <X size={12} />
                  </button>
                </div>
              )}
              <div className="relative flex items-center gap-2">
                <input
                  type="file"
                  hidden
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleImageUpload}
                />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                >
                  <Camera size={20} />
                </Button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Kuch poocho bhai..."
                  className="flex-1 bg-slate-50 border-none focus:ring-2 focus:ring-blue-100 rounded-2xl px-4 py-2.5 text-sm"
                />
                <Button 
                  onClick={() => handleSendMessage()}
                  disabled={loading || (!input.trim() && !imageBase64)}
                  className="rounded-xl bg-[#013062] hover:bg-[#024080] shrink-0"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send size={18} />}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PricingModal
        isOpen={pricingOpen}
        onOpenChange={setPricingOpen}
        requiredTier={pricingRequiredTier}
      />
    </>
  );
};

function cleanAndFormatJeenieText(text: string, isFirstResponse: boolean): string {
  let formatted = text.trim();
  
  formatted = formatted
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[#013062] font-bold">$1</strong>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');

  if (formatted.includes('$')) {
    formatted = formatted.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => renderLatex(`$$${latex}$$`));
    formatted = formatted.replace(/\$([^$]+)\$/g, (full, latex) => {
      if (/^\s*\d+(\.\d+)?\s*$/.test(latex)) return full;
      return renderLatex(`$${latex}$`);
    });
  }
  
  return formatted;
}

export default AIDoubtSolver;

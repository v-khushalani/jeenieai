import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  X,
  Send,
  Loader2,
  AlertCircle,
  Wand2,
  Bot,
  User,
  Clock,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { aiAPI } from "@/services/api/modules/ai";
import { aiQueue } from "@/services/api/queue";
import DOMPurify from "dompurify";
import { logger } from "@/utils/logger";
import { replaceGreekLetters } from "@/constants/unified";
import { renderLatex, containsLatex } from "@/utils/mathRenderer";
import { useAuth } from "@/contexts/AuthContext";
import AIDoubtActionChips, { type ChipDef } from "@/components/AIDoubtActionChips";
import PricingModal from "@/components/PricingModal";
import type { JeenieMode, JeenieModeSource } from "@/services/api/types";

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
}

const AIDoubtSolver: React.FC<AIDoubtSolverProps> = ({
  question,
  isOpen,
  onClose,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const RATE_LIMIT_MS = 2000;
  const isAIAvailable = useMemo(() => aiAPI.isAvailable(), []);

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
    const isGeneral =
      !question?.option_a || question?.question?.includes("koi bhi");
    if (isGeneral) {
      return `
<div style="padding: 2px 0 0 0;">
  <div style="margin-top:4px;font-size:14px;font-weight:800;color:#0b2536;line-height:1.4;">Hello! Main hu JEEnie. Kya puchna chahte ho? 😉</div>
</div>`;
    } else {
      const options = [
        question.option_a && `A) ${escapeHtml(question.option_a)}`,
        question.option_b && `B) ${escapeHtml(question.option_b)}`,
        question.option_c && `C) ${escapeHtml(question.option_c)}`,
        question.option_d && `D) ${escapeHtml(question.option_d)}`,
      ].filter(Boolean).join('<br>');

      return `
<div style="padding: 2px 0 0 0;">
  <div style="margin-top:4px;font-size:13px;font-weight:700;color:#0b2536;line-height:1.4;">${escapeHtml(question.question)}</div>
  <div style="margin-top:8px;padding:10px;border-radius:12px;background:#fff;border:1px solid rgba(11,37,54,0.06);font-size:12px;line-height:1.6;color:#0b2536;font-weight:600;">
    ${options || 'Tap below to ask for a full solution.'}
  </div>
  <div style="margin-top:8px;font-size:11px;line-height:1.4;color:rgba(11,37,54,0.68);font-weight:500;">
    Tap below for a short worked solution — I’ll keep it snappy 😉
  </div>
</div>`;
    }
  }, [question]);

  const isInitialAssistantMessage = (message: Message, index: number) =>
    index === 0 && message.role === 'assistant' && message.content === initialMessage;

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{ role: "assistant", content: initialMessage }]);
    }
  }, [isOpen, messages.length, initialMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const playSound = (tone: "send" | "receive") => {
    const audio = new Audio(
      tone === "send"
        ? "https://cdn.pixabay.com/download/audio/2022/03/15/audio_040b9c8d6b.mp3?filename=click-124467.mp3"
        : "https://cdn.pixabay.com/download/audio/2022/03/15/audio_8f27e7a46a.mp3?filename=notification-5-173230.mp3"
    );
    audio.volume = 0.25;
    audio.play().catch(() => {});
  };

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
      // Extract base64 data (remove data:image/...;base64, prefix)
      setImageBase64(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImagePreview(null);
    setImageBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const buildConversationHistory = (currentMessages: Message[]): string => {
    const recentMessages = currentMessages.slice(-6);
    if (recentMessages.length === 0) return "";
    
    return recentMessages.map(msg => {
      const role = msg.role === "user" ? "Student" : "JEEnie";
      const cleanContent = msg.content.replace(/<[^>]*>/g, '').substring(0, 300);
      return `${role}: ${cleanContent}`;
    }).join("\n");
  };

  const callEdgeFunction = async (
    prompt: string,
    conversationHistory: string,
    base64Image: string | undefined,
    mode: JeenieMode,
    modeSource: JeenieModeSource,
  ): Promise<{ text: string; quotaExhausted?: boolean; upgradeTo?: 'pro' | 'pro_plus' | null }> => {
    try {
      logger.info("Calling JEEnie via API layer...");

      const payload: any = {
        contextPrompt: prompt,
        mode,
        modeSource,
        conversationHistory: conversationHistory ? [
          { role: 'user', content: conversationHistory, timestamp: new Date().toISOString() }
        ] : undefined,
      };

      if (base64Image) {
        payload.image = base64Image;
      }

      const { data, error: apiError } = await aiAPI.askJeenie(payload);

      if (apiError) {
        logger.error("API error from JEEnie:", apiError);
        const errorType = apiError.code;

        if (errorType === "RATE_LIMITED" || apiError.message.includes("rate")) {
          throw new Error("JEEnie abhi chai pe gaya hai! ☕ 2 second ruk, wapas aata hai!");
        } else if (apiError.message.includes("overloaded") || apiError.message.includes("unavailable")) {
          throw new Error("JEEnie ke neurons mein traffic jam! 🧠 Thoda patience, genius loading...");
        } else if (apiError.message.includes("timeout")) {
          throw new Error("JEEnie itna soch raha hai ki time hi nikal gaya! ⏰ Dobara pooch!");
        } else {
          throw new Error("Oho! JEEnie thoda confuse ho gaya! 🤪 Ek aur baar try kar, pakka answer dega!");
        }
      }

      if (!data || !data.response) {
        throw new Error("JEEnie ko kuch samajh nahi aaya! 😅 Thoda aur detail mein pooch!");
      }

      return {
        text: data.response.trim(),
        quotaExhausted: !!data.quota_exhausted,
        upgradeTo: data.upgrade_to ?? null,
      };

    } catch (error) {
      logger.error("Error calling JEEnie Edge Function:", error);
      if (error instanceof Error) throw error;
      throw new Error("Internet connection check karo! 🌐 JEEnie se baat nahi ho pa rahi.");
    }
  };



  const handleSendMessage = async (
    overrideInput?: string,
    explicitMode?: JeenieMode,
    explicitModeSource?: JeenieModeSource,
  ) => {
    const effectiveInput = (overrideInput ?? input).trim();
    if (!effectiveInput && !imageBase64) return;
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Pehle login kar bhai! 🔑 JEEnie sirf apne students se baat karta hai.");
      return;
    }

    const now = Date.now();
    if (now - lastRequestTime < RATE_LIMIT_MS) {
      const waitTime = Math.ceil((RATE_LIMIT_MS - (now - lastRequestTime)) / 1000);
      setError(`☕ JEEnie ${waitTime} second mein ready hoga! Thoda patience...`);
      return;
    }

    setLastRequestTime(now);
    setLoading(true);
    playSound("send");

    const userContent = effectiveInput || (imageBase64 ? "📸 Photo se doubt solve karo" : "");
    const userMsg: Message = { role: "user", content: userContent, imageUrl: imagePreview || undefined };
    setMessages((prev) => [...prev, userMsg]);

    const currentImage = imageBase64;
    setInput("");
    clearImage();

    try {
      const isGeneral = !question?.option_a || question?.question?.includes("koi bhi");
      const history = buildConversationHistory(messages);

      // Personality + formatting + mode-specific teaching rules now live in the
      // server's modular system prompt (supabase/functions/_shared/jeeniePrompt.ts).
      // We send only the user's actual content here — keeps per-request tokens minimal.
      let prompt: string;
      if (currentImage) {
        prompt = userContent !== "📸 Photo se doubt solve karo"
          ? `Student ne photo bheji hai aur saath bola: "${userContent}". Image dekh, question identify kar, complete solution de.`
          : `Student ne doubt ki photo bheji hai. Image dekh, question identify kar, complete solution de.`;
      } else if (isGeneral) {
        prompt = `Student ka doubt: "${userContent}"`;
      } else {
        prompt = `Question: ${question.question}\nOptions: A) ${question.option_a}, B) ${question.option_b}, C) ${question.option_c}, D) ${question.option_d}\n\nStudent ka doubt: "${userContent}"`;
      }


      setTyping(true);
      const mode: JeenieMode = explicitMode ?? 'auto';
      const modeSource: JeenieModeSource = explicitModeSource ?? (explicitMode ? 'manual_chip' : 'auto');
      const aiResult = await callEdgeFunction(prompt, history, currentImage || undefined, mode, modeSource);
      // Note: do NOT run sanitizeRoast here — it strips "Hello Puttar!", markdown
      // and salutations which JEEnie's doubt-solver answers rely on for tone.
      const isFirstResponse = messages.filter((m) => m.role === 'user').length === 0;
      const formatted = cleanAndFormatJeenieText(aiResult.text, isFirstResponse);
      playSound("receive");
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: formatted,
        upgradeTo: aiResult.quotaExhausted ? (aiResult.upgradeTo ?? null) : undefined,
      }]);
    } catch (error: any) {
      logger.error("Error in handleSendMessage:", error);
      const errorMessage = error instanceof Error
        ? error.message
        : "JEEnie ka chirag thoda garam ho gaya! 🧞‍♂️🔥 Ek minute ruk, thanda hone de!";
      setMessages((prev) => [...prev, { role: "assistant", content: errorMessage }]);
    } finally {
      setTyping(false);
      setLoading(false);
    }
  };

  const hasQuestionContext = !!question?.option_a && !question?.question?.includes("koi bhi");
  // Show quick-actions only when no user message has been sent yet
  const showQuickActions = hasQuestionContext && !loading && !messages.some((m) => m.role === "user");
  const quickActions: { label: string; emoji: string; prompt: string; mode: JeenieMode }[] = [
    { label: "Sirf Answer", emoji: "✅", mode: 'quick', prompt: "Sirf final correct answer batao (A/B/C/D), bina kuch extra explanation ke. 1 line max — no greeting, no headings." },
    { label: "Solution", emoji: "📝", mode: 'steps', prompt: "Step-by-step short solution do is question ka. Sirf zaroori steps, koi filler nahi. Complete answer dena — beech mein kabhi mat ruko." },
    { label: "Formula", emoji: "💡", mode: 'quick', prompt: "Sirf woh key formula(s) batao jo is question mein use hote hain. Symbols ka matlab bhi 1 line mein. Short mein." },
  ];

  const handleQuickAction = (qa: { prompt: string; mode: JeenieMode }) => {
    handleSendMessage(qa.prompt, qa.mode, 'manual_chip');
  };


  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-[28px] shadow-[0_24px_80px_rgba(2,18,36,0.08)] max-w-lg w-full max-h-[85dvh] sm:max-h-[90vh] flex flex-col overflow-hidden border border-[#0b2536]/6 relative">
        {/* Floating JEEnie Icon */}
        <div className="absolute -top-6 sm:-top-8 left-1/2 -translate-x-1/2 bg-[#013062] p-2 sm:p-3 rounded-full shadow-lg animate-bounce">
          <Wand2 className="text-white w-5 h-5 sm:w-6 sm:h-6" />
        </div>

        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-[#0b2536]/8 bg-white/60 sm:rounded-t-[28px] flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <Bot className="text-[#013062]" size={18} />
            <div>
              <h3 className="font-extrabold text-[#013062] text-lg sm:text-xl tracking-tight">
                  JEEnie
                </h3>
                <p className="text-xs text-[#013062]/70 font-medium hidden sm:block">
                {!isAIAvailable ? (
                  <span className="text-[#013062]">Busy. Still thinking.</span>
                ) : queuePosition ? (
                  <span className="text-[#013062]">
                    <Clock size={10} className="inline mr-1" />
                    Queue position: {queuePosition}
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#013062]/70 hover:text-[#013062] hover:bg-white p-1.5 sm:p-2 rounded-lg transition-all"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Chat Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 bg-secondary/30 text-primary">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-end ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.role === "assistant" && (
                <div className={`bg-secondary p-1.5 sm:p-2 rounded-full mr-1.5 sm:mr-2 shrink-0 ${isInitialAssistantMessage(msg, i) ? 'ring-2 ring-primary/15 bg-primary/5' : ''}`}>
                  <Bot className={isInitialAssistantMessage(msg, i) ? 'text-primary' : 'text-accent-foreground'} size={14} />
                </div>
              )}
              <div
                className={`max-w-[85%] sm:max-w-[80%] p-2.5 sm:p-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm leading-relaxed shadow-xs ${
                  msg.role === "user"
                    ? "bg-linear-to-r from-accent-foreground to-primary text-primary-foreground rounded-br-sm"
                    : isInitialAssistantMessage(msg, i)
                      ? "bg-linear-to-br from-white via-blue-50 to-indigo-50 border border-primary/15 text-primary rounded-bl-sm shadow-md"
                      : "bg-background border border-border text-primary rounded-bl-sm"
                }`}
              >
                {msg.imageUrl && (
                  <img 
                    src={msg.imageUrl} 
                    alt="Uploaded doubt" 
                    className="w-full max-h-40 object-contain rounded-lg mb-2 border border-primary-foreground/20"
                  />
                )}
                <div
                  className={isInitialAssistantMessage(msg, i) ? "text-xs sm:text-sm [&_strong]:font-extrabold" : "text-xs sm:text-sm"}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(msg.content),
                  }}
                />
                {msg.role === "assistant" && msg.upgradeTo && (
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <Button
                      size="sm"
                      className="bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold shadow-md"
                      onClick={() => {
                        setPricingRequiredTier(msg.upgradeTo as 'pro' | 'pro_plus');
                        setPricingOpen(true);
                      }}
                    >
                      🚀 Upgrade to {msg.upgradeTo === 'pro_plus' ? 'Pro+' : 'Pro'}
                    </Button>
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="bg-secondary p-1.5 sm:p-2 rounded-full ml-1.5 sm:ml-2 shrink-0">
                  <User className="text-primary" size={14} />
                </div>
              )}
            </div>
          ))}

          {typing && (
            <div className="flex justify-start items-center gap-2 text-accent-foreground">
              <div className="bg-background border border-border px-3 py-2 rounded-2xl shadow-xs flex gap-1 items-center">
                <span className="w-2 h-2 bg-accent-foreground rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-accent-foreground/80 rounded-full animate-bounce delay-100"></span>
                <span className="w-2 h-2 bg-accent-foreground/60 rounded-full animate-bounce delay-200"></span>
              </div>
            </div>
          )}

          {/* Follow-up action chips — appear ONLY after the student has asked a
              real doubt (question mark, digits, math, or doubt-keyword). Greetings,
              one-word acknowledgements, and chit-chat do NOT trigger chips. */}
          {(() => {
            const lastUser = [...messages].reverse().find((m) => m.role === 'user');
            const isRealDoubt = lastUser
              ? (() => {
                  const t = lastUser.content.replace(/<[^>]*>/g, '').trim().toLowerCase();
                  if (!t || t.length < 6) return false;
                  // Strong signals it's an actual question/problem.
                  if (/[?=]/.test(t)) return true;
                  if (/\d/.test(t) && t.length > 8) return true;
                  if (/\b(solve|derive|prove|explain|find|calculate|compute|why|how|what|define|kya|kyun|kyu|kaise|samjha|samjhao|batao|bataye|doubt|question|formula|concept|theorem|reaction|equation|numerical|problem)\b/.test(t)) return true;
                  // Long-ish free text — treat as a doubt.
                  return t.length >= 25;
                })()
              : false;
            const showChips = !loading && !typing && lastUser && messages[messages.length - 1]?.role === 'assistant' && isRealDoubt;
            if (!showChips) return null;
            return (
            <div className="px-1">
              <AIDoubtActionChips
                tier={subscriptionTier}
                disabled={loading}
                onChip={(chip: ChipDef) => {
                  handleSendMessage(chip.prompt, chip.mode, 'manual_chip');
                }}
                onLocked={(chip: ChipDef) => {
                  setPricingRequiredTier(chip.minTier);
                  setPricingOpen(true);
                }}
              />
            </div>
            );
          })()}


          {error && (
            <div className="flex justify-center">
              <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-xl flex items-center gap-2 text-sm">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Image Preview */}
        {imagePreview && (
          <div className="px-3 pt-2 bg-secondary/30 border-t border-border">
            <div className="relative inline-block">
              <img 
                src={imagePreview} 
                alt="Preview" 
                className="h-16 w-auto rounded-lg border border-border shadow-xs"
              />
              <button
                onClick={clearImage}
                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-2.5 sm:p-3 border-t border-border bg-secondary/30 pb-[calc(0.75rem+env(safe-area-inset-bottom,0))] sm:pb-3 space-y-2">
          {/* Quick Actions — saves tokens by sending pre-defined intents */}
          {showQuickActions && (
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {quickActions.map((qa) => (
                <button
                  key={qa.label}
                  type="button"
                  onClick={() => handleQuickAction(qa)}
                  disabled={loading}
                  className="flex-1 min-w-[30%] text-[11px] sm:text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-accent text-foreground hover:text-accent-foreground transition-all disabled:opacity-50"
                >
                  <span className="mr-1">{qa.emoji}</span>{qa.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 sm:gap-2 items-center">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              capture="environment"
              className="hidden"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 border-border hover:bg-secondary text-accent-foreground h-9 w-9 sm:h-10 sm:w-10"
              title="📸 Photo se doubt pucho"
            >
              <Camera size={16} />
            </Button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={imageBase64 ? "Optional note (photo attached)" : "Type your doubt or upload a photo"}
              onKeyPress={handleKeyPress}
              className="flex-1 px-3 sm:px-4 py-2 sm:py-3 bg-background border border-border rounded-lg sm:rounded-xl text-primary placeholder:text-muted-foreground focus:ring-2 focus:ring-ring outline-hidden text-xs sm:text-sm transition-all"
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={loading || (!input.trim() && !imageBase64)}
              className="bg-linear-to-r from-accent-foreground to-primary hover:opacity-90 text-primary-foreground px-3 sm:px-6 rounded-lg sm:rounded-xl transition-all shadow-md h-auto"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Send size={16} />
              )}
            </Button>
          </div>
        </div>
      </div>

      <PricingModal
        isOpen={pricingOpen}
        onClose={() => setPricingOpen(false)}
        limitType="ai_doubt_locked"
        requiredTier={pricingRequiredTier}
      />
    </div>
  );
};

function cleanAndFormatJeenieText(text: string, isFirstResponse: boolean = false): string {
  let formatted = text;
  
  if (!isFirstResponse) {
    formatted = formatted
      .replace(/\*?\*?Hello Puttar!?\*?\*?\s*🧞‍♂️?\s*/gi, '')
      .replace(/Hello Puttar!?\s*/gi, '')
      .replace(/^[\s\n]*/, '');
  }
  
  formatted = replaceGreekLetters(formatted);

  // ---- Strip raw LaTeX artifacts that escape KaTeX (text outside $...$). ----
  // \textbf{X} → **X**, \text{X} → X, \mathrm{X} → X
  formatted = formatted
    .replace(/\\textbf\{([^}]*)\}/g, '**$1**')
    .replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|operatorname)\{([^}]*)\}/g, '$1')
    // \circ outside math → °  (handles "20\circ", "20^\circ", "20°\circ")
    .replace(/\^?\\circ/g, '°')
    // \times, \cdot, \div, \pm outside math
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    // Orphan single `$` followed by a number with stray backslash like "$60^\"
    .replace(/\$([^$\n]{0,40})\\\s*$/gm, '$1')
    // Collapse leftover lone backslashes at line ends
    .replace(/\\\s*$/gm, '');

  formatted = formatted
    .replace(/->/g, '→')
    .replace(/<-/g, '←')
    .replace(/<=>/g, '⇌')
    .replace(/>=/g, '≥')
    .replace(/<=/g, '≤')
    .replace(/!=/g, '≠')
    .replace(/~=/g, '≈')
    .replace(/\^2(?![0-9])/g, '²')
    .replace(/\^3(?![0-9])/g, '³')
    .replace(/\+-/g, '±')
    .replace(/H2O/g, 'H₂O')
    .replace(/CO2/g, 'CO₂')
    .replace(/O2(?![0-9])/g, 'O₂')
    .replace(/N2(?![0-9])/g, 'N₂')
    .replace(/H2(?![0-9O])/g, 'H₂')
    .replace(/SO4/g, 'SO₄')
    .replace(/NO3/g, 'NO₃')
    .replace(/NH3/g, 'NH₃')
    .replace(/CH4/g, 'CH₄')
    .replace(/H2SO4/g, 'H₂SO₄')
    .replace(/HNO3/g, 'HNO₃')
    .replace(/([A-Za-z])_([A-Za-z0-9]+)/g, '$1<sub>$2</sub>');

  // NOTE: we intentionally do NOT synthesize bullets from "**Title**:" patterns
  // anymore. That was shredding short prose into noisy bullet lists.

  // Markdown → HTML headings. Convert numbered sub-headings ("#### 5. Title")
  // into a clean "Step 5: Title" so students don't see literal '####'.
  formatted = formatted
    .replace(/^####\s*(\d+)\.\s*(.+)$/gm, '<h4 class="font-bold text-primary mt-3 mb-1 text-sm">Step $1: $2</h4>')
    .replace(/^####\s+(.+)$/gm, '<h4 class="font-bold text-primary mt-3 mb-1 text-sm">$1</h4>')
    .replace(/^###\s*(\d+)\.\s*(.+)$/gm, '<h4 class="font-bold text-primary mt-3 mb-1 text-sm">Step $1: $2</h4>')
    .replace(/^###\s+(.+)$/gm, '<h4 class="font-bold text-primary mt-3 mb-1 text-sm">$1</h4>')
    .replace(/^##\s+(.+)$/gm, '<h3 class="font-extrabold text-primary mt-3 mb-1 text-base">$1</h3>')
    .replace(/^#\s+(.+)$/gm, '<h3 class="font-extrabold text-primary mt-3 mb-1 text-base">$1</h3>');

  // Numbered lists: "1. item" → <ol><li>
  formatted = formatted.replace(/(?:^|\n)((?:\s*\d+\.\s+.+(?:\n|$))+)/g, (_, block: string) => {
    const items = block
      .trim()
      .split(/\n/)
      .map((l) => l.replace(/^\s*\d+\.\s+/, '').trim())
      .filter(Boolean)
      .map((t) => `<li class="ml-1">${t}</li>`) 
      .join('');
    return `\n<ol class="list-decimal pl-5 my-2 space-y-1 marker:text-accent-foreground marker:font-bold">${items}</ol>\n`;
  });

  // Bullet lists: lines starting with -, *, • → <ul><li>
  formatted = formatted.replace(/(?:^|\n)((?:\s*[-*•]\s+.+(?:\n|$))+)/g, (_, block: string) => {
    const items = block
      .trim()
      .split(/\n/)
      .map((l) => l.replace(/^\s*[-*•]\s+/, '').trim())
      .filter(Boolean)
      .map((t) => `<li class="ml-1">${t}</li>`) 
      .join('');
    return `\n<ul class="list-disc pl-5 my-2 space-y-1 marker:text-accent-foreground">${items}</ul>\n`;
  });

  formatted = formatted
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-primary font-bold">$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
    // Collapse 3+ newlines, then convert remaining newlines to <br>
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>')
    // Don't put <br> right before/after block tags
    .replace(/<br>\s*(<\/?(?:ul|ol|li|h3|h4)[^>]*>)/g, '$1')
    .replace(/(<\/(?:ul|ol|li|h3|h4)>)\s*<br>/g, '$1')
    ;

  // Render LaTeX: $$...$$ (display) and $...$ (inline) via KaTeX
  if (formatted.includes('$') || containsLatex(formatted)) {
    // Process display math $$...$$
    formatted = formatted.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => renderLatex(`$$${latex}$$`));
    // Process inline math $...$
    formatted = formatted.replace(/\$([^$]+)\$/g, (full, latex) => {
      if (/^\s*\d+(\.\d+)?\s*$/.test(latex)) return full; // skip currency
      return renderLatex(`$${latex}$`);
    });
    // If no $ but has LaTeX commands, render the whole thing
    if (!formatted.includes('$') && !formatted.includes('class="katex"') && containsLatex(formatted)) {
      formatted = renderLatex(formatted);
    }
  }
  
  return formatted.trim();
}

export default AIDoubtSolver;

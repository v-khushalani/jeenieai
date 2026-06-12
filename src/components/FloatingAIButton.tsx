import React, { useEffect, useRef, useState } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import AIDoubtSolver from './AIDoubtSolver';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';
import { useCurrentJeenieQuestion } from '@/lib/currentQuestionStore';

import safeLocalStorage from '@/utils/safeStorage';
const DRAG_STORAGE_KEY = 'jeenie_ai_button_position';
const BUTTON_SIZE = 64;
const EDGE_MARGIN = 16;
const START_OFFSET_X = 24;
const START_OFFSET_Y = 112;

const getDefaultButtonPosition = () => {
  if (typeof window === 'undefined') {
    return { x: START_OFFSET_X, y: START_OFFSET_Y };
  }

  return {
    x: window.innerWidth - BUTTON_SIZE - START_OFFSET_X,
    y: window.innerHeight - BUTTON_SIZE - START_OFFSET_Y,
  };
};

const FloatingAIButton = () => {
  const [showAI, setShowAI] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState(() => getDefaultButtonPosition());
  const [isDragging, setIsDragging] = useState(false);
  const suppressNextClickRef = useRef(false);
  const dragStateRef = useRef<{ startX: number; startY: number; pointerOffsetX: number; pointerOffsetY: number; moved: boolean } | null>(null);
  const { isAuthenticated, subscriptionTier } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const aiEnabled = useFeatureFlag('ai_doubt_solver');
  const isPaidUser = subscriptionTier === 'pro' || subscriptionTier === 'pro_plus';
  const liveQuestion = useCurrentJeenieQuestion();

  const hiddenPaths = ['/test-attempt', '/admin', '/educator', '/auth/callback', '/login', '/signup'];
  const shouldHide = hiddenPaths.some((path) => location.pathname.startsWith(path));

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = safeLocalStorage.getItem(DRAG_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { x: number; y: number };
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          setPosition({
            x: clamp(parsed.x, EDGE_MARGIN, window.innerWidth - BUTTON_SIZE - EDGE_MARGIN),
            y: clamp(parsed.y, EDGE_MARGIN, window.innerHeight - BUTTON_SIZE - EDGE_MARGIN),
          });
          return;
        }
      }
    } catch {
      // fall through to default position
    }

    setPosition(getDefaultButtonPosition());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setPosition((current) => ({
        x: clamp(current.x || getDefaultButtonPosition().x, EDGE_MARGIN, window.innerWidth - BUTTON_SIZE - EDGE_MARGIN),
        y: clamp(current.y || getDefaultButtonPosition().y, EDGE_MARGIN, window.innerHeight - BUTTON_SIZE - EDGE_MARGIN),
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const savePosition = (nextPosition: { x: number; y: number }) => {
    setPosition(nextPosition);
    try {
      safeLocalStorage.setItem(DRAG_STORAGE_KEY, JSON.stringify(nextPosition));
    } catch {
      // Ignore storage failures.
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      pointerOffsetX: event.clientX - position.x,
      pointerOffsetY: event.clientY - position.y,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    const nextX = clamp(event.clientX - dragState.pointerOffsetX, EDGE_MARGIN, window.innerWidth - BUTTON_SIZE - EDGE_MARGIN);
    const nextY = clamp(event.clientY - dragState.pointerOffsetY, EDGE_MARGIN, window.innerHeight - BUTTON_SIZE - EDGE_MARGIN);

    if (Math.abs(event.clientX - dragState.startX) > 4 || Math.abs(event.clientY - dragState.startY) > 4) {
      dragState.moved = true;
      setIsDragging(true);
    }

    savePosition({ x: nextX, y: nextY });
  };

  const handlePointerUp = () => {
    const dragState = dragStateRef.current;
    const moved = !!dragState?.moved;
    dragStateRef.current = null;
    suppressNextClickRef.current = moved;
    setIsDragging(false);
  };

  // Hide the floating AI button on paths where it's not applicable,
  // when the AI feature flag is off, when user isn't authenticated,
  // or when user is not on a paid plan (pro / pro+).
  if (shouldHide || !aiEnabled || !isAuthenticated || !isPaidUser) return null;

  const handleOpenAI = () => {
    if (!isAuthenticated) {
      const redirectTo = encodeURIComponent(location.pathname + location.search);
      navigate(`/login?redirect=${redirectTo}`);
      return;
    }

    setShowAI(true);
  };

  const generalQuestion = liveQuestion ?? {
    question: "I have a doubt...",
    option_a: "", option_b: "", option_c: "", option_d: "",
  };

  return (
    <>
      {!showAI && (
        <button
          onClick={(event) => {
            if (isDragging || suppressNextClickRef.current) {
              event.preventDefault();
              suppressNextClickRef.current = false;
              return;
            }
            handleOpenAI();
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`fixed z-9999 group select-none touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ left: `${position.x}px`, top: `${position.y}px` }}
          aria-label="AI Doubt Solver"
        >
          <div className="absolute inset-0">
            <div className="w-16 h-16 rounded-full bg-linear-to-r from-purple-500 to-pink-500 opacity-30 animate-pulse" />
          </div>
          <div className="relative w-16 h-16 bg-linear-to-br from-purple-600 via-pink-600 to-indigo-600 rounded-full shadow-2xl flex items-center justify-center transform transition-all duration-300 hover:scale-110 hover:shadow-purple-500/50">
            <div className="absolute -top-1 -right-1 animate-bounce">
              <Sparkles className="w-4 h-4 text-yellow-300" fill="currentColor" />
            </div>
            <Bot className="w-8 h-8 text-white" />
          </div>
          {isHovered && (
            <div className="absolute bottom-full right-0 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="bg-linear-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-lg shadow-xl whitespace-nowrap">
                <p className="text-sm font-semibold">🤖 Ask JEEnie Anything!</p>
                <p className="text-xs opacity-90">AI Tutor — Doubts, Life, Motivation 💡</p>
              </div>
              <div className="absolute top-full right-4 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-purple-600" />
            </div>
          )}
        </button>
      )}

      <AIDoubtSolver 
        question={generalQuestion}
        isOpen={showAI}
        onClose={() => setShowAI(false)}
      />
    </>
  );
};

export default FloatingAIButton;

/**
 * AI API Module
 * 
 * Handles all AI-related API operations with:
 * - Response caching (common questions)
 * - Request queuing with rate limiting
 * - Retry logic
 * - Fallback responses
 */

import { apiClient } from '../apiClient';
import { cache, CACHE_TTL, CACHE_TAGS } from '../cache';
import { aiQueue } from '../queue';
import type { JeenieRequest, JeenieResponse, StudyPlanRequest, StudyPlanResponse, ApiResponse } from '../types';

// Common questions cache - precomputed answers for frequent questions
const COMMON_ANSWERS: Record<string, string> = {
  'velocity formula': `**Hello Puttar!** 🧞‍♂️

Newton ki kasam, velocity ka formula bahut simple hai!

**Velocity = Displacement / Time**

या **v = s/t** (where s = displacement, t = time)

For uniform acceleration:
- v = u + at
- v² = u² + 2as

Yaad rakhna: Velocity ek vector quantity hai, speed nahi!`,

  'newton laws': `**Hello Puttar!** 🧞‍♂️

**Newton's Three Laws of Motion:**

1️⃣ **First Law (Inertia):** An object at rest stays at rest, an object in motion stays in motion, unless acted upon by an external force.

2️⃣ **Second Law (F = ma):** Force equals mass times acceleration.

3️⃣ **Third Law (Action-Reaction):** For every action, there is an equal and opposite reaction.

Practice problems se yaad rakhoge! 💪`,

  'quadratic formula': `**Hello Puttar!** 🧞‍♂️

**Quadratic Formula:**

For ax² + bx + c = 0:

x = (-b ± √(b² - 4ac)) / 2a

**Key Points:**
- Discriminant (D) = b² - 4ac
- If D > 0: Two real roots
- If D = 0: One real root
- If D < 0: Complex roots

Ratta maar lo, exam mein zaroor aayega! 📚`,

  'integration': `**Hello Puttar!** 🧞‍♂️

**Integration is the reverse of differentiation!**

**Basic Formulas:**
- ∫xⁿ dx = xⁿ⁺¹/(n+1) + C
- ∫eˣ dx = eˣ + C
- ∫sin(x) dx = -cos(x) + C
- ∫cos(x) dx = sin(x) + C
- ∫1/x dx = ln|x| + C

Remember: Always add constant C! 🎯`,
};

export const aiAPI = {
  /**
   * Ask JEEnie AI a question
   */
  async askJeenie(request: JeenieRequest): Promise<ApiResponse<JeenieResponse>> {
    // Normalize question for cache lookup
    const normalizedQuestion = request.contextPrompt.toLowerCase().trim();
    
    // Check precomputed answers first
    for (const [key, answer] of Object.entries(COMMON_ANSWERS)) {
      if (normalizedQuestion.includes(key)) {
        return {
          data: {
            response: answer,
            suggestions: [
              'Try a practice problem',
              'Related topics',
              'Video explanation',
            ],
          },
          error: null,
        };
      }
    }

    // Check cache for similar questions
    const cacheKey = this.generateCacheKey(request.contextPrompt);
    const cached = cache.get<JeenieResponse>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    // Queue the API request
    return aiQueue.enqueue(
      async () => {
        const result = await apiClient.callEdgeFunction<JeenieRequest, JeenieResponse>(
          'jeenie',
          request,
          { useQueue: false }
        );

        // Cache successful responses
        if (result.data && !result.error) {
          cache.set(cacheKey, result.data, CACHE_TTL.DAY, [CACHE_TAGS.AI]);
        }

        return result;
      },
      { priority: 'normal', maxRetries: 2 }
    );
  },

  /**
   * Generate study plan
   */
  async generateStudyPlan(request: StudyPlanRequest): Promise<ApiResponse<StudyPlanResponse>> {
    const cacheKey = `study-plan:${request.userId}:${request.goalExam}:${request.targetRank}`;
    const cached = cache.get<StudyPlanResponse>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    return aiQueue.enqueue(
      async () => {
        const result = await apiClient.callEdgeFunction<StudyPlanRequest, StudyPlanResponse>(
          'generate-study-plan',
          request,
          { useQueue: false }
        );

        if (result.data && !result.error) {
          cache.set(cacheKey, result.data, CACHE_TTL.VERY_LONG, [CACHE_TAGS.AI]);
        }

        return result;
      },
      { priority: 'low', maxRetries: 1 }
    );
  },

  /**
   * Text to speech
   */
  async textToSpeech(text: string): Promise<ApiResponse<{ audioUrl: string }>> {
    // Cache by text hash
    const cacheKey = `tts:${this.hashString(text)}`;
    const cached = cache.get<{ audioUrl: string }>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    return aiQueue.enqueue(
      async () => {
        const result = await apiClient.callEdgeFunction<{ text: string }, { audioUrl: string }>(
          'text-to-speech',
          { text },
          { useQueue: false }
        );

        if (result.data && !result.error) {
          cache.set(cacheKey, result.data, CACHE_TTL.VERY_LONG, [CACHE_TAGS.AI]);
        }

        return result;
      },
      { priority: 'low', maxRetries: 1 }
    );
  },

  /**
   * Voice to text
   */
  async voiceToText(audioBlob: Blob): Promise<ApiResponse<{ text: string }>> {
    return aiQueue.enqueue(
      async () => {
        // Convert blob to base64
        const base64 = await this.blobToBase64(audioBlob);
        
        return apiClient.callEdgeFunction<{ audio: string }, { text: string }>(
          'voice-to-text',
          { audio: base64 },
          { useQueue: false }
        );
      },
      { priority: 'high', maxRetries: 1 }
    );
  },

  /**
   * Extract questions from a single PDF page image
   * Note: The edge function processes one page at a time as images.
   * For full PDF processing, use PDFQuestionExtractor component which
   * handles page-by-page conversion and calls this per page.
   */
  async extractPdfQuestions(
    imageBase64: string,
    metadata?: { 
      sourceFile?: string;
      pageNumber?: number;
      subject?: string; 
      chapter?: string;
      exam?: string;
    }
  ): Promise<ApiResponse<{ questions: unknown[]; questionsExtracted: number; pageType: string }>> {
    return aiQueue.enqueue(
      async () => {
        return apiClient.callEdgeFunction<
          { 
            imageBase64: string;
            sourceFile: string;
            pageNumber: number;
            subject?: string;
            chapter?: string;
            exam?: string;
          },
          { questions: unknown[]; questionsExtracted: number; pageType: string }
        >(
          'extract-pdf-questions',
          { 
            imageBase64,
            sourceFile: metadata?.sourceFile || 'unknown.pdf',
            pageNumber: metadata?.pageNumber || 1,
            subject: metadata?.subject,
            chapter: metadata?.chapter,
            exam: metadata?.exam,
          },
          { useQueue: false }
        );
      },
      { priority: 'low', maxRetries: 1 }
    );
  },

  /**
  /**
   * Generate AI insights for study planner (legacy format)
   * Matches existing useStudyPlanner hook parameters
   */
  async generateAIInsights(params: {
    userId: string;
    studyHours: number;
    targetExam: string;
    daysRemaining: number;
    strengths: string[];
    weaknesses: string[];
    avgAccuracy: number;
  }): Promise<ApiResponse<{
    insights: {
      personalizedGreeting: string;
      strengthAnalysis: string;
      weaknessStrategy: string;
      keyRecommendations: string[];
      motivationalMessage: string;
    };
  }>> {
    const cacheKey = `ai-insights:${params.userId}:${params.targetExam}:${params.daysRemaining}`;
    const cached = cache.get<{ insights: any }>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    return aiQueue.enqueue(
      async () => {
        const result = await apiClient.callEdgeFunction<typeof params, { insights: any }>(
          'generate-study-plan',
          params,
          { useQueue: false }
        );

        if (result.data && !result.error) {
          cache.set(cacheKey, result.data, CACHE_TTL.LONG, [CACHE_TAGS.AI]);
        }

        return result;
      },
      { priority: 'low', maxRetries: 2 }
    );
  },

  /**
   * Get AI service status
   */
  getQueueStats() {
    return aiQueue.getStats();
  },

  /**
   * Check if AI is available
   */
  isAvailable(): boolean {
    const stats = aiQueue.getStats();
    return !stats.circuitOpen;
  },

  /**
   * Invalidate AI cache
   */
  invalidateCache(): void {
    cache.invalidateByTag(CACHE_TAGS.AI);
  },

  // Private helpers

  generateCacheKey(question: string): string {
    // Normalize and create deterministic key
    const normalized = question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 100);
    return `jeenie:${normalized}`;
  },

  hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  },

  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1] || base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },
};

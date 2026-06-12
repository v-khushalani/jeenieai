import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

import safeLocalStorage from '@/utils/safeStorage';
interface ExamConfig {
  exam_name: string;
  exam_date: string;
}

interface CachedExamDates {
  ts: number;
  data: ExamConfig[];
}

export type ExamType = 'JEE' | 'NEET' | 'Scholarship' | 'Foundation' | string;

const EXAM_DATES_CACHE_KEY = 'jeenie_exam_dates_cache_v1';
const EXAM_DATES_TTL_MS = 30 * 60 * 1000;

export const useExamDates = () => {
  const [jeeDate, setJeeDate] = useState('2026-05-24');
  const [neetDate, setNeetDate] = useState('2026-05-05');
  const [scholarshipDate, setScholarshipDate] = useState('2026-02-15');
  const [foundationDate, setFoundationDate] = useState('2026-03-15');
  const [loading, setLoading] = useState(true);

  const loadExamDates = useCallback(async () => {
    try {
      const rawCache = safeLocalStorage.getItem(EXAM_DATES_CACHE_KEY);
      if (rawCache) {
        const parsed = JSON.parse(rawCache) as CachedExamDates;
        const isFresh = Date.now() - parsed.ts < EXAM_DATES_TTL_MS;
        if (isFresh && Array.isArray(parsed.data)) {
          applyExamDates(parsed.data);
          setLoading(false);
          return;
        }
      }

      const { data, error } = await supabase
        .from('exam_config')
        .select('exam_name, exam_date');

      if (error) throw error;

      if (Array.isArray(data)) {
        applyExamDates(data);
        safeLocalStorage.setItem(EXAM_DATES_CACHE_KEY, JSON.stringify({
          ts: Date.now(),
          data,
        } as CachedExamDates));
      }
    } catch (error) {
      logger.error('Error loading exam dates:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExamDates();
  }, [loadExamDates]);

  const applyExamDates = (data: ExamConfig[]) => {
    const jee = data.find((e) => e.exam_name === 'JEE');
    const neet = data.find((e) => e.exam_name === 'NEET');
    const scholarship = data.find((e) => e.exam_name === 'Scholarship');
    const foundation = data.find((e) => e.exam_name === 'Foundation');

    if (jee) setJeeDate(jee.exam_date);
    if (neet) setNeetDate(neet.exam_date);
    if (scholarship) setScholarshipDate(scholarship.exam_date);
    if (foundation) setFoundationDate(foundation.exam_date);
  };

  const getExamDate = (examType: ExamType): string => {
    if (examType === 'JEE' || examType === 'JEE Main' || examType === 'JEE Advanced') return jeeDate;
    if (examType === 'NEET') return neetDate;
    if (examType === 'Scholarship') return scholarshipDate;
    if (examType?.startsWith('Foundation')) return foundationDate;
    return jeeDate; // Default fallback
  };

  return { jeeDate, neetDate, scholarshipDate, foundationDate, getExamDate, loading };
};
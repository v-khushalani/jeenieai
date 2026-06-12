/**
 * Curated catalog of Hugging Face datasets that will be imported into the
 * Grade 6-10 Foundation questions bank.
 *
 * Project is non-commercial, so license restrictions are ignored — we only
 * keep `source` attribution on the resulting question rows.
 */

export interface HFDatasetCatalogEntry {
  id: string;
  datasetPath: string;
  config?: string;
  split: string;
  displayName: string;
  description: string;
  license: string;
  targetGrades: number[];
  subjects: string[];
  estimatedRows: number;
  /** Default subject + chapter strategy used by the importer. */
  importStrategy: {
    /** "fixed" -> use subjects[0]. "ai" -> classify with Lovable AI (SciQ). */
    subjectStrategy: 'fixed' | 'ai';
    /** "field" -> dataset has category/chapter field. "ai" -> 1-token AI tag. "constant" -> single bucket. */
    chapterStrategy: 'field' | 'ai' | 'constant';
    /** Default grade if importer can't bucket per row. */
    defaultGrade: number;
    /** Default difficulty bucket. */
    defaultDifficulty: 'Easy' | 'Medium' | 'Hard';
  };
  notes?: string;
}

export const HF_DATASET_CATALOG: HFDatasetCatalogEntry[] = [
  {
    id: 'math-qa',
    datasetPath: 'shulijia/MNLP_M3_mcqa_dataset_mathqa_orig',
    split: 'train',
    displayName: 'MathQA — MCQ Math with Rationale',
    description:
      'Math word problems with multiple-choice options, correct answer letter, and a step-by-step rationale. Chapter is inferred from the question text via deterministic keyword rules.',
    license: 'Apache-2.0 (mirror of allenai/math_qa)',
    targetGrades: [6, 7, 8, 9, 10],
    subjects: ['Mathematics'],
    estimatedRows: 29837,
    importStrategy: {
      subjectStrategy: 'fixed',
      chapterStrategy: 'field',
      defaultGrade: 8,
      defaultDifficulty: 'Medium',
    },
    notes: 'Rows without exactly 4 options (A-D) are dropped.',
  },
  {
    id: 'sciq',
    datasetPath: 'allenai/sciq',
    split: 'train',
    displayName: 'SciQ — Science MCQs',
    description:
      'Crowdsourced science MCQs (physics, chemistry, biology). Most rows include a support paragraph used as explanation.',
    license: 'CC BY-NC 3.0',
    targetGrades: [6, 7, 8, 9, 10],
    subjects: ['Physics', 'Chemistry', 'Biology'],
    estimatedRows: 13679,
    importStrategy: {
      subjectStrategy: 'ai',
      chapterStrategy: 'ai',
      defaultGrade: 8,
      defaultDifficulty: 'Medium',
    },
    notes: 'Subject + chapter are inferred via Lovable AI (~140 batched calls for the full dataset).',
  },
  {
    id: 'openbookqa-main',
    datasetPath: 'allenai/openbookqa',
    config: 'main',
    split: 'train',
    displayName: 'OpenBookQA — Elementary Science',
    description:
      'Elementary-level science MCQs that require multi-hop reasoning. No category field — imported under a single "General Science" chapter for Grade 6-7.',
    license: 'Apache-2.0',
    targetGrades: [6, 7],
    subjects: ['Science'],
    estimatedRows: 4957,
    importStrategy: {
      subjectStrategy: 'fixed',
      chapterStrategy: 'constant',
      defaultGrade: 7,
      defaultDifficulty: 'Easy',
    },
    notes: 'All rows land in a single "General Science" chapter — no AI tagging.',
  },
];

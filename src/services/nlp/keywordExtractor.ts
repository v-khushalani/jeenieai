/**
 * Keyword Extractor Module
 * Optimized for JEE/NEET exam content with domain-specific handling
 */

// Extended stop words including academic terms that are too common
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'should', 'could', 'may', 'might', 'must', 'can', 'what', 'which',
  'who', 'when', 'where', 'why', 'how', 'this', 'that', 'these', 'those',
  'if', 'then', 'than', 'such', 'some', 'any', 'each', 'every', 'all',
  'both', 'either', 'neither', 'not', 'only', 'own', 'same', 'so', 'as',
  'find', 'given', 'calculate', 'determine', 'value', 'following', 'one',
  'two', 'three', 'four', 'five', 'correct', 'option', 'answer', 'question',
  'statement', 'true', 'false', 'respectively', 'thus', 'therefore', 'hence',
  'also', 'just', 'like', 'about', 'into', 'over', 'after', 'below', 'above'
]);

// Domain-specific keywords that should be preserved with higher weight
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  Physics: [
    'force', 'velocity', 'acceleration', 'momentum', 'energy', 'mass', 'work',
    'power', 'displacement', 'friction', 'gravity', 'wave', 'frequency',
    'amplitude', 'wavelength', 'electric', 'magnetic', 'current', 'voltage',
    'resistance', 'capacitor', 'inductor', 'optics', 'lens', 'mirror',
    'thermodynamics', 'entropy', 'heat', 'temperature', 'pressure',
    'rotational', 'angular', 'torque', 'inertia', 'pendulum', 'oscillation',
    'quantum', 'photon', 'electron', 'proton', 'neutron', 'nucleus',
    'radioactive', 'semiconductor', 'diode', 'transistor', 'circuit'
  ],
  Chemistry: [
    'atom', 'molecule', 'element', 'compound', 'reaction', 'bond', 'ionic',
    'covalent', 'oxidation', 'reduction', 'acid', 'base', 'salt', 'ph',
    'equilibrium', 'catalyst', 'organic', 'inorganic', 'polymer', 'alkane',
    'alkene', 'alkyne', 'aromatic', 'benzene', 'alcohol', 'aldehyde',
    'ketone', 'ester', 'ether', 'amine', 'amide', 'carboxylic', 'metal',
    'nonmetal', 'periodic', 'orbital', 'hybridization', 'electronegativity',
    'molarity', 'molality', 'concentration', 'solution', 'solvent', 'solute',
    'electrolysis', 'electrode', 'galvanic', 'thermochemistry', 'enthalpy'
  ],
  Mathematics: [
    'function', 'derivative', 'integral', 'limit', 'continuity', 'matrix',
    'determinant', 'vector', 'equation', 'polynomial', 'quadratic', 'linear',
    'exponential', 'logarithm', 'trigonometry', 'sine', 'cosine', 'tangent',
    'probability', 'permutation', 'combination', 'sequence', 'series',
    'arithmetic', 'geometric', 'binomial', 'conic', 'parabola', 'ellipse',
    'hyperbola', 'circle', 'coordinate', 'geometry', 'differential',
    'integration', 'complex', 'imaginary', 'real', 'rational', 'irrational'
  ],
  Biology: [
    'cell', 'nucleus', 'mitochondria', 'chromosome', 'gene', 'dna', 'rna',
    'protein', 'enzyme', 'metabolism', 'photosynthesis', 'respiration',
    'mitosis', 'meiosis', 'genetics', 'heredity', 'mutation', 'evolution',
    'species', 'ecosystem', 'biodiversity', 'organ', 'tissue', 'membrane',
    'hormone', 'neuron', 'synapse', 'immunity', 'antibody', 'virus',
    'bacteria', 'fungi', 'plant', 'animal', 'reproduction', 'fertilization'
  ]
};

export interface KeywordResult {
  keywords: string[];
  weightedKeywords: Map<string, number>;
  domainHits: string[];
}

/**
 * Extract keywords from text with domain awareness
 */
export function extractKeywords(text: string, subject?: string): KeywordResult {
  if (!text) {
    return { keywords: [], weightedKeywords: new Map(), domainHits: [] };
  }

  // Normalize text
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s+\-*/=^()₀₁₂₃₄₅₆₇₈₉]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Tokenize
  const tokens = normalized.split(' ').filter(t => t.length >= 2);
  
  // Build keyword map with weights
  const weightedKeywords = new Map<string, number>();
  const domainHits: string[] = [];
  
  // Get relevant domain keywords
  const relevantDomains = subject 
    ? [DOMAIN_KEYWORDS[subject] || []]
    : Object.values(DOMAIN_KEYWORDS);
  const domainKeywordSet = new Set(relevantDomains.flat());

  for (const token of tokens) {
    // Skip stop words and short tokens
    if (STOP_WORDS.has(token) || token.length < 3) continue;
    
    // Skip numbers unless part of a unit
    if (/^\d+$/.test(token)) continue;
    
    let weight = 1;
    
    // Boost domain-specific keywords
    if (domainKeywordSet.has(token)) {
      weight = 3;
      if (!domainHits.includes(token)) {
        domainHits.push(token);
      }
    }
    
    // Boost longer meaningful words
    if (token.length > 8) weight *= 1.2;
    
    // Accumulate weight
    weightedKeywords.set(token, (weightedKeywords.get(token) || 0) + weight);
  }

  // Extract n-grams (bigrams) for compound concepts
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]}_${tokens[i + 1]}`;
    if (
      !STOP_WORDS.has(tokens[i]) && 
      !STOP_WORDS.has(tokens[i + 1]) &&
      tokens[i].length >= 3 && 
      tokens[i + 1].length >= 3
    ) {
      weightedKeywords.set(bigram, 1.5);
    }
  }

  // Sort by weight and get top keywords
  const sortedKeywords = Array.from(weightedKeywords.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  return {
    keywords: sortedKeywords.slice(0, 30), // Limit to top 30
    weightedKeywords,
    domainHits
  };
}

/**
 * Extract keywords from chapter/topic names for matching
 */
export function extractCurriculumKeywords(name: string): string[] {
  if (!name) return [];
  
  const normalized = name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized
    .split(' ')
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
}

/**
 * Historical exam weightage matrix (chapter-level).
 * Averages derived from JEE Main (2019–2025 NTA shifts, AIEEE/JEE 2002–2018 trend)
 * and NEET (2013–2025). Values = expected questions per paper + effort to master.
 * Matching is keyword-based on chapter names so it survives naming variations.
 */
export type Tier = 1 | 2 | 3;
export interface Weightage { tier: Tier; expectedQ: number; effortHrs: number }

type Row = [RegExp, number, number]; // pattern, expected questions/paper, effort hours

const JEE: Record<string, Row[]> = {
  Physics: [
    [/modern|dual nature|atom|nucle|photoelectric/i, 3, 12],
    [/current electric/i, 2.5, 14],
    [/semiconductor|electronic/i, 1.5, 6],
    [/electrostat|electric charge|potential|capacitan/i, 2.5, 18],
    [/magnet|moving charge/i, 2, 16],
    [/ray optics|wave optics|optics/i, 2, 16],
    [/electromagnetic induction|alternating|\bac\b/i, 1.5, 14],
    [/electromagnetic wave/i, 1, 3],
    [/kinematic|motion in (a )?(straight|plane)/i, 1.5, 10],
    [/law(s)? of motion|friction/i, 1, 12],
    [/work|energy|power/i, 1, 10],
    [/thermodynamic|kinetic theory|thermal/i, 2, 12],
    [/oscillation|\bshm\b|waves/i, 1.5, 14],
    [/gravitation/i, 1, 8],
    [/fluid|mechanical properties|elastic/i, 1, 10],
    [/rotation|rigid body|system of particles/i, 1, 26],
    [/unit|measurement|error/i, 1, 4],
  ],
  Chemistry: [
    [/coordination/i, 2, 8],
    [/electrochem/i, 1.5, 8],
    [/chemical bond|molecular structure/i, 2, 12],
    [/p.?block/i, 2, 12],
    [/d.?block|f.?block|d and f/i, 1.5, 8],
    [/biomolecule|polymer|everyday/i, 1, 4],
    [/amine|nitrogen/i, 1, 6],
    [/aldehyde|ketone|carboxylic|carbonyl/i, 1.5, 10],
    [/alcohol|phenol|ether/i, 1, 8],
    [/haloalkane|haloarene/i, 1, 6],
    [/hydrocarbon/i, 1, 8],
    [/goc|general organic|basic principles|organic chemistry.*(basic|some)/i, 2, 14],
    [/kinetic/i, 1.5, 6],
    [/thermodynamic|thermochem/i, 1.5, 10],
    [/solution/i, 1, 6],
    [/atomic structure|structure of atom/i, 1, 8],
    [/periodic/i, 1, 5],
    [/mole concept|basic concepts|stoichiometry/i, 1, 6],
    [/ionic equilibri/i, 1, 18],
    [/equilibri/i, 1, 12],
    [/redox/i, 0.5, 5],
  ],
  Mathematics: [
    [/vector|three dimensional|3d/i, 3, 12],
    [/matri|determinant/i, 2, 8],
    [/definite integral|area under/i, 2, 14],
    [/integral/i, 1.5, 16],
    [/differential equation/i, 1.5, 8],
    [/probabil/i, 1.5, 10],
    [/statistic/i, 1, 4],
    [/sequence|series|progression/i, 1.5, 8],
    [/binomial/i, 1, 6],
    [/permutation|combination/i, 1, 10],
    [/limit|continuity|differentiab/i, 1.5, 10],
    [/application of derivative|derivative/i, 1, 12],
    [/straight line|circle|conic|parabola|ellipse|hyperbola|coordinate/i, 2.5, 22],
    [/function|relation/i, 1, 8],
    [/trigonometr|inverse trig/i, 1, 12],
    [/quadratic/i, 1, 10],
    [/complex/i, 1, 16],
    [/set|mathematical reasoning/i, 0.5, 3],
  ],
};

const NEET: Record<string, Row[]> = {
  Biology: [
    [/genetic|inheritance|molecular basis/i, 6, 16],
    [/human physiology|digestion|breathing|body fluid|excretion|locomotion|neural|chemical coordination/i, 8, 24],
    [/ecology|ecosystem|biodiversity|organism.*population|environment/i, 6, 10],
    [/plant physiology|photosynth|respiration in plant|plant growth|transport in plant|mineral nutrition/i, 5, 16],
    [/reproduct/i, 5, 12],
    [/cell|biomolecule/i, 5, 12],
    [/structural organi[sz]ation|morphology|anatomy/i, 4, 10],
    [/diversity|living world|classification|plant kingdom|animal kingdom/i, 5, 14],
    [/biotech/i, 4, 8],
    [/evolution/i, 2, 5],
    [/human health|microbes/i, 3, 6],
  ],
  Physics: JEE.Physics,
  Chemistry: JEE.Chemistry,
};

const norm = (s: string) => (/^bio|botany|zoology/i.test(s) ? 'Biology' : /^math/i.test(s) ? 'Mathematics' : /^chem/i.test(s) ? 'Chemistry' : /^phys/i.test(s) ? 'Physics' : s);

export function getWeightage(exam: string, subject: string, chapter: string): Weightage {
  const table = /neet/i.test(exam) ? NEET : JEE;
  const rows = table[norm(subject)] || [];
  const hit = rows.find(([re]) => re.test(chapter));
  const expectedQ = hit ? hit[1] : 1;
  const effortHrs = hit ? hit[2] : 10;
  // ROI = questions per 10 hours of effort
  const roi = (expectedQ / effortHrs) * 10;
  const tier: Tier = roi >= 1.6 ? 1 : roi >= 0.9 ? 2 : 3;
  return { tier, expectedQ, effortHrs };
}

export const marksPerQ = (exam: string) => 4;

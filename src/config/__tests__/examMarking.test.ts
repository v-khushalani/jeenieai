import { describe, it, expect } from 'vitest';
import { getSubjectMarking } from '../examPatterns';
describe('marking', () => {
  it('JEE custom = +4/-1', () => expect(getSubjectMarking('JEE Mains', 'Physics')).toEqual({ correctMarks: 4, incorrectMarks: -1 }));
  it('missing pattern = +4/-1', () => expect(getSubjectMarking('', null)).toEqual({ correctMarks: 4, incorrectMarks: -1 }));
  it('NEET = +4/-1', () => expect(getSubjectMarking('NEET', 'Biology')).toEqual({ correctMarks: 4, incorrectMarks: -1 }));
  it('Foundation = +1/0', () => expect(getSubjectMarking('Foundation', 'Physics')).toEqual({ correctMarks: 1, incorrectMarks: 0 }));
  it('CET maths = +2/0', () => expect(getSubjectMarking('MHT-CET', 'Mathematics')).toEqual({ correctMarks: 2, incorrectMarks: 0 }));
});

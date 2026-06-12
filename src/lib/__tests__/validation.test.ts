import { describe, it, expect } from 'vitest';
import { signupSchema, loginSchema } from '../validation';

// ─── signupSchema ───────────────────────────────────────────
describe('signupSchema', () => {
  const validData = {
    fullName: 'Varun Khushalani',
    email: 'varun@example.com',
    password: 'Secret1pass',
    confirmPassword: 'Secret1pass',
  };

  it('accepts valid signup data', () => {
    const result = signupSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  // ── fullName ──
  describe('fullName', () => {
    it('rejects name shorter than 2 chars', () => {
      const result = signupSchema.safeParse({ ...validData, fullName: 'A' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 2');
      }
    });

    it('rejects name longer than 100 chars', () => {
      const result = signupSchema.safeParse({ ...validData, fullName: 'A'.repeat(101) });
      expect(result.success).toBe(false);
    });

    it('rejects name with numbers', () => {
      const result = signupSchema.safeParse({ ...validData, fullName: 'Varun123' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('letters and spaces');
      }
    });

    it('rejects name with special characters', () => {
      const result = signupSchema.safeParse({ ...validData, fullName: 'Varun@K' });
      expect(result.success).toBe(false);
    });

    it('accepts name with spaces', () => {
      const result = signupSchema.safeParse({ ...validData, fullName: 'Varun K' });
      expect(result.success).toBe(true);
    });
  });

  // ── email ──
  describe('email', () => {
    it('rejects invalid email', () => {
      const result = signupSchema.safeParse({ ...validData, email: 'not-an-email' });
      expect(result.success).toBe(false);
    });

    it('rejects empty email', () => {
      const result = signupSchema.safeParse({ ...validData, email: '' });
      expect(result.success).toBe(false);
    });

    it('accepts valid email formats', () => {
      const emails = ['user@example.com', 'a@b.co', 'user.name+tag@domain.org'];
      emails.forEach((email) => {
        const result = signupSchema.safeParse({ ...validData, email });
        expect(result.success).toBe(true);
      });
    });
  });

  // ── password ──
  describe('password', () => {
    it('rejects password shorter than 8 chars', () => {
      const result = signupSchema.safeParse({
        ...validData,
        password: 'Ab1',
        confirmPassword: 'Ab1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects password without uppercase letter', () => {
      const result = signupSchema.safeParse({
        ...validData,
        password: 'alllower1',
        confirmPassword: 'alllower1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects password without lowercase letter', () => {
      const result = signupSchema.safeParse({
        ...validData,
        password: 'ALLUPPER1',
        confirmPassword: 'ALLUPPER1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects password without digit', () => {
      const result = signupSchema.safeParse({
        ...validData,
        password: 'NoDigitHere',
        confirmPassword: 'NoDigitHere',
      });
      expect(result.success).toBe(false);
    });

    it('accepts strong password', () => {
      const result = signupSchema.safeParse({
        ...validData,
        password: 'StrongPass9',
        confirmPassword: 'StrongPass9',
      });
      expect(result.success).toBe(true);
    });
  });

  // ── confirmPassword ──
  describe('confirmPassword', () => {
    it('rejects mismatched passwords', () => {
      const result = signupSchema.safeParse({
        ...validData,
        confirmPassword: 'DifferentPass1',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes("don't match"))).toBe(true);
      }
    });
  });
});

// ─── loginSchema ────────────────────────────────────────────
describe('loginSchema', () => {
  it('accepts valid login data', () => {
    const result = loginSchema.safeParse({ email: 'user@test.com', password: 'secret' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({ email: 'bad', password: 'secret' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ email: 'user@test.com', password: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty email', () => {
    const result = loginSchema.safeParse({ email: '', password: 'secret' });
    expect(result.success).toBe(false);
  });
});

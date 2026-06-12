import { z } from 'zod';

// List of commonly weak passwords to prevent
const WEAK_PASSWORDS = new Set([
  'password', 'password123', '123456', 'abc123', 'qwerty',
  'letmein', 'welcome', 'admin', 'root', 'student'
]);

// Signup form validation schema with enhanced password security
export const signupSchema = z.object({
  fullName: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters and spaces'),
  
  email: z.string()
    .email('Please enter a valid email address')
    .min(1, 'Email is required'),
  
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/(?=.*[a-z])/, 'Password must contain lowercase letters')
    .regex(/(?=.*[A-Z])/, 'Password must contain uppercase letters')
    .regex(/(?=.*\d)/, 'Password must contain numbers')
    .refine((pwd) => !WEAK_PASSWORDS.has(pwd.toLowerCase()),
            'This password is too common. Please choose a stronger password'),
  
  confirmPassword: z.string()
    .min(1, 'Please confirm your password')
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Login form validation schema
export const loginSchema = z.object({
  email: z.string()
    .email('Please enter a valid email address')
    .min(1, 'Email is required'),
  
  password: z.string()
    .min(1, 'Password is required')
});

export type SignupFormData = z.infer<typeof signupSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;

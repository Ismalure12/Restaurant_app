import { z } from 'zod';
import { EMAIL_RE } from './common';

const email = (blank) => z.string().trim().min(1, blank).regex(EMAIL_RE, 'Enter a valid email, like name@example.com');

export const loginSchema = z.object({
  email: email('Enter your email'),
  password: z.string().min(1, 'Enter your password'),
});

export const forgotSchema = z.object({ email: email('Enter your email') });

export const resetSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

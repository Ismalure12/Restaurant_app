// Zod schemas — Staff sign-in and password reset.
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email({ error: 'Invalid email address' }),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.email({ error: 'Invalid email address' }),
});

export const resetPasswordSchema = z.object({
  email: z.email({ error: 'Invalid email address' }),
  code: z.string().length(6, 'Reset code must be exactly 6 characters'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

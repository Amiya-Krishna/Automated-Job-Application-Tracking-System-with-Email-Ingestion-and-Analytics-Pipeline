import { z } from 'zod';

// Mirrors client/src/pages/Login.jsx's validateLogin() exactly.
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .regex(/\S+@\S+\.\S+/, 'Enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// Mirrors client/src/pages/Register.jsx's validateRegister() exactly,
// including the confirm-password check.
export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Full name is required')
      .min(2, 'Enter at least 2 characters'),
    email: z
      .string()
      .trim()
      .min(1, 'Email is required')
      .regex(/\S+@\S+\.\S+/, 'Enter a valid email address'),
    password: z
      .string()
      .min(1, 'Password is required')
      .min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

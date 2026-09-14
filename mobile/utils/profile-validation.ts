import { z } from 'zod';

// Matches the web client's Profile.jsx form exactly (same fields, same
// "all optional, send blank as a real clear" semantics) — see
// client/src/pages/Profile.jsx. Unlike application-validation.ts's
// partial-update fields, this form always submits the full state:
// server/routes/profileRoutes.js's POST /api/profile is read on load and
// resubmitted whole, so there's no separate "leave unchanged" case to
// preserve with `undefined`.
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const optionalEmail = z
  .string()
  .trim()
  .refine((value) => value === '' || EMAIL_PATTERN.test(value), 'Enter a valid email address');

// experience_years is Decimal(3,1) in prisma/schema.prisma — up to 3
// total digits, 1 after the decimal point (e.g. "99.9" is the largest
// valid value) — matching the web client's `type="number" step="0.5"`
// input, kept here as a string until submit since RHF/TextInput values
// are always strings.
const optionalExperienceYears = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{1,3}(\.\d)?$/.test(value), 'Use a number like 5 or 5.5');

export const profileFormSchema = z.object({
  fullName: z.string().trim(),
  email: optionalEmail,
  experienceYears: optionalExperienceYears,
  skills: z.string().trim(),
  resumeText: z.string().trim(),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const profileFormDefaults: ProfileFormValues = {
  fullName: '',
  email: '',
  experienceYears: '',
  skills: '',
  resumeText: '',
};

/**
 * POST /api/profile body. Matches server/routes/profileRoutes.js's
 * destructured fields exactly: fullName, email, resumeText, skills
 * (array), experienceYears (number|null, coerced straight into a Prisma
 * Decimal field with no server-side parsing).
 */
export interface ProfileRequestBody {
  fullName: string;
  email: string;
  resumeText: string;
  skills: string[];
  experienceYears: number | null;
}

export function toProfileRequestBody(values: ProfileFormValues): ProfileRequestBody {
  return {
    fullName: values.fullName,
    email: values.email,
    resumeText: values.resumeText,
    skills: values.skills
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean),
    experienceYears: values.experienceYears ? Number(values.experienceYears) : null,
  };
}

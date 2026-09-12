import { z } from 'zod';

import { TRACKED_JOB_STATUSES } from '@/types/applications';

// yyyy-mm-dd, matching how jobRoutes.js's normalizeInterviewDate() and
// the applicationDate `new Date(...)` coercion expect date fields to
// arrive (see types/applications.ts's TrackedJobInput comment). Optional
// fields use `''` as the RHF default (TextInput can't be undefined) and
// are converted to `undefined` before the request is sent — see
// toCreateApplicationInput/toUpdateApplicationInput below.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === '' || DATE_PATTERN.test(value), 'Use the format YYYY-MM-DD');

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === '' || /^https?:\/\/\S+\.\S+/.test(value), 'Enter a full URL starting with http(s)://');

export const applicationFormSchema = z.object({
  company: z.string().trim().min(1, 'Company is required'),
  role: z.string().trim().min(1, 'Job title is required'),
  status: z.enum(TRACKED_JOB_STATUSES),
  location: z.string().trim(),
  notes: z.string().trim(),
  sourceUrl: optionalUrl,
  applicationDate: optionalDate,
  interviewDate: optionalDate,
  description: z.string().trim(),
});

export type ApplicationFormValues = z.infer<typeof applicationFormSchema>;

export const applicationFormDefaults: ApplicationFormValues = {
  company: '',
  role: '',
  status: 'Applied',
  location: '',
  notes: '',
  sourceUrl: '',
  applicationDate: '',
  interviewDate: '',
  description: '',
};

/** Converts blank optional strings to `undefined` so the request never overwrites an existing value with an empty string. */
function orUndefined(value: string): string | undefined {
  return value === '' ? undefined : value;
}

export function toApplicationRequestBody(values: ApplicationFormValues) {
  return {
    company: values.company,
    role: values.role,
    status: values.status,
    location: orUndefined(values.location),
    notes: orUndefined(values.notes),
    sourceUrl: orUndefined(values.sourceUrl),
    applicationDate: orUndefined(values.applicationDate),
    interviewDate: orUndefined(values.interviewDate),
    description: orUndefined(values.description),
  };
}

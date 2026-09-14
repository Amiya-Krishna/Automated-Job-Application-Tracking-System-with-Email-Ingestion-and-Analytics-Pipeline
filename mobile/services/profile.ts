import { api } from '@/services/api';
import type { Profile } from '@/types/profile';
import type { ProfileRequestBody } from '@/utils/profile-validation';

export async function getProfile(): Promise<Profile | null> {
  const { data } = await api.get<{ data: Profile | null }>('/profile');
  return data.data;
}

/**
 * POST /api/profile — upserts the authenticated user's profile.
 * Returns only `{ status: 'created' | 'updated' }` (see
 * server/routes/profileRoutes.js), not the saved row, so callers must
 * invalidate `['profile']` afterwards rather than read the response for
 * fresh data — see hooks/use-profile.ts's useUpdateProfile.
 */
export async function updateProfile(input: ProfileRequestBody): Promise<void> {
  await api.post('/profile', input);
}

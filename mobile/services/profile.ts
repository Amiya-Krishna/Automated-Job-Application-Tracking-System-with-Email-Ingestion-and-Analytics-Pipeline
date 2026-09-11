import { api } from '@/services/api';
import type { Profile } from '@/types/profile';

export async function getProfile(): Promise<Profile | null> {
  const { data } = await api.get<{ data: Profile | null }>('/profile');
  return data.data;
}

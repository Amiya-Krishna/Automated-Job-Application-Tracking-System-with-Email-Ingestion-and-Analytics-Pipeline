import { api } from '@/services/api';
import type { JobSource } from '@/types/sources';

export async function getSources(): Promise<JobSource[]> {
  const { data } = await api.get<{ data: JobSource[] }>('/sources');
  return data.data;
}

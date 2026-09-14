import { api } from '@/services/api';
import type { JobSource, JobSourceDetail } from '@/types/sources';

export async function getSources(): Promise<JobSource[]> {
  const { data } = await api.get<{ data: JobSource[] }>('/sources');
  return data.data;
}

export async function getSourceDetail(id: number): Promise<JobSourceDetail> {
  const { data } = await api.get<{ data: JobSourceDetail }>(`/sources/${id}`);
  return data.data;
}

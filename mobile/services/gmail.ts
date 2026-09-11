import { api } from '@/services/api';
import type { GmailStatus } from '@/types/gmail';

export async function getGmailStatus(): Promise<GmailStatus> {
  const { data } = await api.get<GmailStatus>('/gmail/status');
  return data;
}

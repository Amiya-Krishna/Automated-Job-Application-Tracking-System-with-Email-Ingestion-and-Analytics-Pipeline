/**
 * The signed-in user's notification inbox (server-side, per account).
 * Every endpoint only ever returns / changes the caller's own notifications.
 */
import { api } from '@/services/api';
import type { NotificationKind, NotificationTarget } from '@/types/notifications';

export interface InboxNotification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  target: NotificationTarget | null;
  read: boolean;
  createdAt: string;
}

export async function fetchInbox(): Promise<{ data: InboxNotification[]; unreadCount: number }> {
  const { data } = await api.get<{ data: InboxNotification[]; unreadCount: number }>('/notifications/inbox');
  return data;
}

export async function createInboxNotification(input: { kind: NotificationKind; title: string; body: string; target?: NotificationTarget }): Promise<InboxNotification | null> {
  const { data } = await api.post<{ data: InboxNotification | null }>('/notifications/inbox', input);
  return data.data;
}

export const markInboxRead = (id: number) => api.post(`/notifications/inbox/${id}/read`);
export const markAllInboxRead = () => api.post('/notifications/inbox/read-all');
export const deleteInbox = (id: number) => api.delete(`/notifications/inbox/${id}`);
export const clearInbox = () => api.delete('/notifications/inbox');

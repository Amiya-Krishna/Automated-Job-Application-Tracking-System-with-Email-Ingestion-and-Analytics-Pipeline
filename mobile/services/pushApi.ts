import { api } from '@/services/api';

export interface RemotePreferences {
  pushEnabled: boolean;
  interviewReminders: boolean;
  applicationReminders: boolean;
  jobReminders: boolean;
  timezone: string;
  reminderHour: number;
}

export const DEFAULT_REMOTE_PREFERENCES: RemotePreferences = {
  pushEnabled: true,
  interviewReminders: true,
  applicationReminders: true,
  jobReminders: true,
  timezone: 'UTC',
  reminderHour: 9,
};

export async function fetchPreferences(): Promise<RemotePreferences> {
  const { data } = await api.get<{ preferences: RemotePreferences }>('/notifications/preferences');
  return { ...DEFAULT_REMOTE_PREFERENCES, ...data.preferences };
}

export async function savePreferences(patch: Partial<RemotePreferences>): Promise<RemotePreferences> {
  const { data } = await api.put<{ preferences: RemotePreferences }>('/notifications/preferences', patch);
  return { ...DEFAULT_REMOTE_PREFERENCES, ...data.preferences };
}

export interface DeviceRegistration {
  expoPushToken: string;
  platform: string;
  deviceName: string | null;
  appVersion: string;
  timezone: string;
}

export async function registerDevice(payload: DeviceRegistration): Promise<void> {
  await api.post('/notifications/devices', payload);
}

export async function unregisterDevice(expoPushToken: string): Promise<void> {
  await api.delete('/notifications/devices', { data: { expoPushToken } });
}

export async function sendTestPush(): Promise<{ sent: number; failed: number }> {
  const { data } = await api.post<{ sent: number; failed: number }>('/notifications/test');
  return data;
}

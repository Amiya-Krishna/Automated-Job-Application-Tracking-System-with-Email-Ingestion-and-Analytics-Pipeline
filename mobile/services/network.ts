/**
 * Native connectivity + app-lifecycle wiring. Started once from the root layout.
 *
 *  - Feeds services/connectivity.ts so the API client can fail fast when offline.
 *  - Connects TanStack Query's onlineManager (pause/resume + refetch on reconnect)
 *    and focusManager (refetch stale data when the app returns to the foreground —
 *    React Native has no window focus, so this must be wired by hand).
 * Returns a cleanup function.
 */
import { focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { setOnline } from '@/services/connectivity';

// `isInternetReachable` is null while unknown; only an explicit false means offline.
const toOnline = (s: Network.NetworkState) => s.isConnected !== false && s.isInternetReachable !== false;

export function startNetworkMonitoring(): () => void {
  const apply = (state: Network.NetworkState) => {
    const online = toOnline(state);
    setOnline(online);
    onlineManager.setOnline(online);
  };

  Network.getNetworkStateAsync().then(apply).catch(() => {});
  const netSub = Network.addNetworkStateListener(apply);

  const onAppState = (status: AppStateStatus) => {
    if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
  };
  const appSub = AppState.addEventListener('change', onAppState);

  return () => {
    netSub.remove();
    appSub.remove();
  };
}

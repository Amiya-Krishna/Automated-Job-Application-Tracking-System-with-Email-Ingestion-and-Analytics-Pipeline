import { useContext } from 'react';

import { AuthContext, type AuthContextValue } from '@/providers/AuthProvider';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth() must be called within <AuthProvider>.');
  }
  return context;
}

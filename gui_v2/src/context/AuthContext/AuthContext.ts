import { useUser } from '@clerk/clerk-react';
import { createContext, useContext } from 'react';

type ClerkUser = ReturnType<typeof useUser>['user'];

interface AuthContextType {
  /** Clerk user (null when signed out, undefined while loading). */
  user: ClerkUser;
  /** Admin flag derived from our `profile.role`; null while still loading. */
  isAdmin: boolean | null;
  loadingUser: boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

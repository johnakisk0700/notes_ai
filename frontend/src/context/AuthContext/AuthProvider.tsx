import { api } from '@/integrations/api';
import { useUser } from '@clerk/clerk-react';
import { type ReactNode, useEffect, useState } from 'react';
import { AuthContext } from './AuthContext';

// Bridges Clerk (identity) with our backend `profile` (role). Exposes the same
// shape the app already consumes via useAuth(): { user, isAdmin, loadingUser }.
export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      setIsAdmin(null);
      setLoadingUser(false);
      return;
    }

    let cancelled = false;
    setLoadingUser(true);

    (async () => {
      try {
        const { data } = await api.get<{ role?: string }>('get-profile', {
          params: { userId: user.id },
        });
        if (!cancelled) setIsAdmin(data?.role === 'admin');
      } catch (error) {
        // verifyJWT provisions the profile on first request; if the lookup still
        // fails, fall back to a non-admin role rather than blocking the app.
        console.error('Failed to load profile role:', error);
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user]);

  return <AuthContext.Provider value={{ user, isAdmin, loadingUser }}>{children}</AuthContext.Provider>;
}

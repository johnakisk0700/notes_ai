import { useClerk } from '@clerk/clerk-react';
import { useNavigate } from 'react-router';
import { useAuth } from './AuthContext';

// The signed-in user's display identity (name, email, initials) plus a one-call
// sign-out, shared by the Settings account card and the sidebar account footer so
// the two never drift. Sign-out is a no-op target under the dev bypass — callers
// gate the control on DEV_AUTH_BYPASS rather than this hook.
export function useAccount() {
  const { user, isAdmin } = useAuth();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const name = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || '—';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const initials =
    `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase() || name.slice(0, 2).toUpperCase();

  return {
    user,
    isAdmin,
    name,
    email,
    initials,
    signOut: () => void signOut(() => navigate('/auth')),
  };
}

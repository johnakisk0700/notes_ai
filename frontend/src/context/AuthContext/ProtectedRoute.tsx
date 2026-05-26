import { useUser } from '@clerk/clerk-react';
import { Navigate, Outlet } from 'react-router';
import { DEV_AUTH_BYPASS } from '@/integrations/devAuth';

const ProtectedRoute = () => {
  const { isLoaded, isSignedIn, user } = useUser();

  // Dev-only: skip the Clerk gate (and the onboarding name check) entirely.
  if (DEV_AUTH_BYPASS) return <Outlet />;

  if (!isLoaded) {
    return <div className="flex items-center justify-center h-screen"></div>;
  }

  if (!isSignedIn || !user) {
    return <Navigate to="/auth" replace />;
  }

  // Users with no name in Clerk (e.g. an OAuth provider that gave none) must
  // complete it first. /onboarding lives outside this guard, so no redirect loop.
  if (!user.firstName?.trim() || !user.lastName?.trim()) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;

import { useUser } from '@clerk/clerk-react';
import { Navigate, Outlet } from 'react-router';

const ProtectedRoute = () => {
  const { isLoaded, isSignedIn, user } = useUser();

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

import { useUser } from '@clerk/clerk-react';
import { Navigate, Outlet } from 'react-router';

const ProtectedRoute = () => {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <div className="flex items-center justify-center h-screen"></div>;
  }

  return isSignedIn ? <Outlet /> : <Navigate to="/auth" replace />;
};

export default ProtectedRoute;

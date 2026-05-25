import { Navigate, Outlet } from 'react-router';
import { useAuth } from './AuthContext';
import { RedirectToSignIn } from '@clerk/clerk-react';

const ProtectedRoute = () => {
  const { isAdmin, user, loadingUser } = useAuth();

  if (loadingUser || isAdmin === null) {
    return <div className="flex items-center justify-center h-screen"></div>;
  }

  return user ? <Outlet /> : <RedirectToSignIn />;
};

export default ProtectedRoute;

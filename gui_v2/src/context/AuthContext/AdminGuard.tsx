import { Navigate, Outlet } from 'react-router';
import { useAuth } from './AuthContext';

const AdminGuard = () => {
  const { isAdmin } = useAuth();

  // If user is authenticated but not admin, redirect to home
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  // User is authenticated and is admin
  return <Outlet />;
};

export default AdminGuard;

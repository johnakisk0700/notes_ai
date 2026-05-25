import { Navigate, Outlet } from 'react-router';
import { useAuth } from './AuthContext';

const AdminGuard = () => {
  const { isAdmin, loadingUser } = useAuth();

  // Wait for the role to resolve before deciding, so admins aren't bounced.
  if (loadingUser || isAdmin === null) {
    return <div className="flex items-center justify-center h-screen"></div>;
  }

  return isAdmin ? <Outlet /> : <Navigate to="/" replace />;
};

export default AdminGuard;

import { AuthError, type AuthResponse, type User } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

interface AuthContextType {
  user: User;
  isAdmin: boolean | null;
  signIn: (email: string, password: string) => Promise<AuthResponse>;
  signOut: () => Promise<{ error: AuthError | null }>;
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

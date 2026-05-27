import { createContext, useState, useContext, useEffect } from 'react';
import { fetchAllUsers, type UserProfile } from '../../integrations/users';
import { toast } from 'sonner';

const UsersContext = createContext<UserProfile[]>([]);

export function UsersProvider({ children }) {
  const [users, setUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const names = await fetchAllUsers();
        setUsers(names);
      } catch (error) {
        if (import.meta.env.DEV) console.error('Error loading users:', error);
        toast.error('Failed to load users');
      }
    })();
  }, []);

  return <UsersContext.Provider value={users}>{children}</UsersContext.Provider>;
}

export function useUsersContext() {
  return useContext(UsersContext);
}

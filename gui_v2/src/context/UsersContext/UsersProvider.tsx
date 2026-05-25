import { createContext, useState, useContext, useEffect } from 'react';
import { fetchAllUsers, UserProfile } from '../../integrations/supabase/users';
import { toast } from 'sonner';

const UsersContext = createContext<UserProfile[]>([]);

export function UsersProvider({ children }) {
    const [users, setUsers] = useState<UserProfile[]>([]);

    useEffect(() => {
        (async () => {
            try {
                const names = await fetchAllUsers();
                console.log('Retrieved user list');
                setUsers(names);
            } catch (error) {
                console.error('Error loading users:', error);
                toast.error('Failed to load users');
            }
        })();
    }, []);

    return <UsersContext.Provider value={users}>{children}</UsersContext.Provider>;
}

export function useUsersContext() {
    return useContext(UsersContext);
}

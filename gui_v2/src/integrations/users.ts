import type { Profile } from '@shared/db/schema/profile';
import { api } from './api';

export interface UserProfile {
  id: string;
  userIdentifier: string;
}

// Fetches all profiles from our backend (replaces the old direct Supabase query).
export async function fetchAllUsers(): Promise<UserProfile[]> {
  const {
    data: { data: profiles },
  } = await api.get<{ data: { profile: Profile }[] }>('get-profiles');

  return (profiles || []).map(({ profile }) => ({
    id: profile.id,
    userIdentifier:
      profile.first_name && profile.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : profile.email || 'Unknown User',
  }));
}

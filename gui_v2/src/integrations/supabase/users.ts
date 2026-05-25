import { supabase } from './client';

export async function fetchAllUsers(): Promise<UserProfile[]> {
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name');
    if (profilesError) throw profilesError;

    const { data: profileDetails, error: detailsError } = await supabase
        .from('profile_details')
        .select('id, email');
    if (detailsError) throw detailsError;

    const userProfiles = (profiles || []).map((profile) => {
        const details = profileDetails?.find((d) => d.id === profile.id);
        const userIdentifier =
            profile.first_name && profile.last_name
                ? `${profile.first_name} ${profile.last_name}`
                : details?.email || 'Unknown User';

        return {
            id: profile.id,
            userIdentifier,
        };
    });

    return userProfiles;
}

export interface UserProfile {
    id: string;
    userIdentifier: string;
}

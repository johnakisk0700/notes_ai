import { AdminNotesList } from '@/components/Admin/AdminNotesList';
import { useAuth } from '@/context/AuthContext/AuthContext';
import { api } from '@/integrations/api';
import type { Note } from '@shared/db/schema/notes';
import type { Profile } from '@shared/db/schema/profile';
import type { Tefteri } from '@shared/db/schema/tefteri';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface GroupedNotes {
  [key: string]: Note[];
}

const AdminNotes: React.FC = () => {
  const { t } = useTranslation();
  const [groupedNotes, setGroupedNotes] = useState<GroupedNotes>({});

  const { isAdmin } = useAuth();
  useEffect(() => {
    if (isAdmin) {
      loadNotes();
    }
  }, [isAdmin]);

  const loadNotes = async () => {
    try {
      const {
        data: { notes },
      } = await api.get('get-all-users-notes', {
        params: { orderBy: 'created_at', orderDirection: 'DESC' },
      });

      const userIds: any[] = [...new Set((notes || []).map(note => note.userId))];
      const {
        data: { data: profiles },
      } = await api.get<{ data: { profile: Profile; tefteri: Tefteri | null }[] }>('get-profiles', {
        params: { userIds: userIds },
      });

      const profileMap = new Map(profiles?.map(p => [p.profile.id, p.profile]));
      const emailMap = new Map(profiles?.map(p => [p.profile.id, p.profile.email]));
      console.log(profileMap);
      const grouped = (notes || []).reduce((acc: GroupedNotes, note) => {
        const profile: any = profileMap.get(note.userId);
        const email: any = emailMap.get(note.userId);
        const userFullName =
          profile?.first_name && profile?.last_name
            ? `${profile.first_name} ${profile.last_name}`
            : email || 'Unknown User';

        if (!acc[userFullName]) {
          acc[userFullName] = [];
        }

        acc[userFullName].push({
          ...note,
          user_email: email,
          user_full_name: userFullName,
        });

        return acc;
      }, {});

      setGroupedNotes(grouped);
    } catch (error) {
      console.error('Error loading notes:', error);
      toast.error('Failed to load notes');
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      await api.post('/delete-note', { noteId });
      toast.success('Note deleted successfully');
      loadNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
      toast.error('Failed to delete note');
    }
  };

  return (
    <div className="h-[100dvh] w-full overflow-y-scroll hide-scrollbar">
      {Object.entries(groupedNotes).map(([userIdentifier, notes]) => (
        <AdminNotesList key={userIdentifier} userIdentifier={userIdentifier} notes={notes} />
      ))}
    </div>
  );
};

export default AdminNotes;

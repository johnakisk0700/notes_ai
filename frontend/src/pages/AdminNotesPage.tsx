import { AdminNotesList } from '@/components/Admin/AdminNotesList';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext/AuthContext';
import { api } from '@/integrations/api';
import type { Note } from '@shared/db/schema/notes';
import type { Profile } from '@shared/db/schema/profile';
import type { Tefteri } from '@shared/db/schema/tefteri';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Page } from '@/components/Common/Page';

interface GroupedNotes {
  [key: string]: Note[];
}

const AdminNotes: React.FC = () => {
  const { t } = useTranslation();
  const [groupedNotes, setGroupedNotes] = useState<GroupedNotes>({});
  // The note awaiting delete-confirmation; null means the dialog is closed.
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

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
      if (import.meta.env.DEV) console.error('Error loading notes:', error);
      toast.error('Failed to load notes');
    }
  };

  // The note cards only open the dialog (setNoteToDelete); the actual delete waits for
  // confirmation here. Admins can delete any user's note — the backend authorizes it.
  const confirmDelete = async () => {
    if (!noteToDelete) return;
    try {
      await api.post('/delete-note', { noteId: noteToDelete });
      toast.success(t('successful_note_deletion'));
      loadNotes();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error deleting note:', error);
      toast.error(t('failed_deletion'));
    } finally {
      setNoteToDelete(null);
    }
  };

  return (
    <Page width="full">
      {Object.entries(groupedNotes).map(([userIdentifier, notes]) => (
        <AdminNotesList key={userIdentifier} userIdentifier={userIdentifier} notes={notes} onDelete={setNoteToDelete} />
      ))}

      <Dialog open={noteToDelete !== null} onOpenChange={open => !open && setNoteToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('are_you_sure')}</DialogTitle>
            <DialogDescription>{t('note_deletion_warning')}</DialogDescription>
          </DialogHeader>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setNoteToDelete(null)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t('confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Page>
  );
};

export default AdminNotes;

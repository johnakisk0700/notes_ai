import { useNotes } from '@/context/NotesContext';
import { api } from '@/integrations/api';
import React, { useEffect } from 'react';
import { toast } from 'sonner';
import { NoteComponent } from './NoteComponent';
import { useTranslation } from 'react-i18next';

const NotesList: React.FC = () => {
  const { t } = useTranslation();

  const { filteredNotes, fetchNotes } = useNotes();

  // Refetch when the notes page mounts, so navigating here shows the latest — the provider only
  // fetches once at app start, so edits made elsewhere (e.g. by the chat assistant) wouldn't show.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount; fetchNotes identity is unstable
  useEffect(() => void fetchNotes(), []);

  const handleDelete = async (noteId: string) => {
    try {
      await api.post('/delete-note', { noteId });
      toast.success(t('successful_note_deletion'));
      fetchNotes();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error deleting note:', error);
      toast.error(t('failed_deletion') + 'note.');
    }
  };

  return (
    <div className="flex w-full flex-col gap-2">
      {filteredNotes?.map(note => (
        <NoteComponent key={note.id} note={note} handleDelete={handleDelete} />
      ))}
    </div>
  );
};

export default NotesList;

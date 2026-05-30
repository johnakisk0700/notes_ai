import { useNotes } from '@/context/NotesContext';
import { api } from '@/integrations/api';
import React from 'react';
import { toast } from 'sonner';
import { NoteComponent } from './NoteComponent';
import { useTranslation } from 'react-i18next';
import { NoteSearch } from './NoteSearch';

const NotesList: React.FC = () => {
  const { t } = useTranslation();

  const { filteredNotes, fetchNotes } = useNotes();

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
    <div className="flex w-full flex-col">
      {/* Search sticks just below the floating toggle (top-14) as notes scroll under it. The strip
          uses the same paper fill (.nb-paper-bg) so it masks the notes without reading as a separate
          block; z-10 keeps it above the cards that follow it in the DOM. */}
      <div className="nb-paper-bg sticky top-14 z-10 mb-3 -mx-4 px-4 py-2 md:-mx-6 md:px-6">
        <NoteSearch />
      </div>
      <div className="flex w-full flex-col gap-2">
        {filteredNotes?.map(note => (
          <NoteComponent key={note.id} note={note} handleDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
};

export default NotesList;

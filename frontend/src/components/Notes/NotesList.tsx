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
    <div className="flex w-full shrink-0 flex-col pb-24 pt-14">
      {/* Search sticks just under the floating title masthead (h-14). A frosted layer
          (semi-transparent paper + backdrop-blur) BLURS the notes scrolling up behind it
          instead of hiding them behind a solid dark block; the notebook margin line continues
          across it. Tune the mask via the bg opacity / blur strength. */}
      <div className="nb-margin-rule sticky top-14 z-10 backdrop-blur-md">
        <div className="mx-auto w-full max-w-7xl px-3 pt-2 pb-2 md:px-1 md:pl-11">
          <NoteSearch className="h-9 bg-background dark:bg-background" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-3 md:px-1 md:pl-11">
        {filteredNotes?.map(note => (
          <NoteComponent key={note.id} note={note} handleDelete={handleDelete} />
        ))}
        <div className="my-20"></div>
      </div>
    </div>
  );
};

export default NotesList;

import { useNotes } from '@/context/NotesContext';
import { api } from '@/integrations/api';
import React from 'react';
import { toast } from 'sonner';
import { NoteComponent } from './NoteComponent';
import { useTranslation } from 'react-i18next';
import { PageRule } from '../Common/PageRule';

const NotesList: React.FC = () => {
  const { t } = useTranslation();

  const { filteredNotes, fetchNotes } = useNotes();

  const handleDelete = async (noteId: string) => {
    try {
      await api.post('/delete-note', { noteId });
      toast.success(t('successful_note_deletion'));
      fetchNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
      toast.error(t('failed_deletion') + 'note.');
    }
  };
  return (
    <div className="flex flex-col gap-3 pb-24 shrink-0 w-full max-w-5xl mx-auto px-1">
      <PageRule label={t('personal_notes')} />
      {filteredNotes?.map(note => (
        <NoteComponent key={note.id} note={note} handleDelete={handleDelete} />
      ))}
      <div className="my-20"></div>
    </div>
  );
};

export default NotesList;

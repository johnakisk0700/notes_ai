import type { Note } from '@shared/db/schema/notes';
import { createContext, useContext, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useGlobalAbortController } from '@/hooks/useGlobalAbortController';

interface NoteEditorContextType {
  isOpen: boolean;
  noteId: string | null;
  openEditor: (note?: Note) => void;
  closeEditor: (onClose?: () => void) => void;
}

const NoteEditorContext = createContext<NoteEditorContextType | undefined>(undefined);

export const NoteEditorProvider = ({ children }: { children: ReactNode }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { cancelAll } = useGlobalAbortController();

  const isOpen = searchParams.has('editor');
  const noteId = searchParams.get('noteId');

  const openEditor = (noteToEdit?: Note) => {
    if (noteToEdit) {
      setSearchParams(prev => ({
        ...Object.fromEntries(prev),
        editor: 'true',
        noteId: noteToEdit.id?.toString() || '',
      }));
    } else {
      setSearchParams(prev => ({ ...Object.fromEntries(prev), editor: 'create' }));
    }
  };

  const closeEditor = () => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.delete('editor');
      newParams.delete('noteId');
      return newParams;
    });
    cancelAll(); // Cancel all pending requests
  };

  return (
    <NoteEditorContext.Provider
      value={{
        isOpen,
        noteId,
        openEditor,
        closeEditor,
      }}
    >
      {children}
    </NoteEditorContext.Provider>
  );
};

export const useNoteEditor = () => {
  const context = useContext(NoteEditorContext);
  if (!context) {
    throw new Error('useNoteEditor must be used within a NoteEditorProvider');
  }
  return context;
};

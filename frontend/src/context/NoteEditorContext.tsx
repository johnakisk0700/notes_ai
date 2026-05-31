import type { Note } from '@shared/db/schema/notes';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useGlobalAbortController } from '@/hooks/useGlobalAbortController';

export interface PendingDraft {
  title: string;
  content: string;
}

interface NoteEditorContextType {
  isOpen: boolean;
  noteId: string | null;
  // A note drafted elsewhere (the chat's create_note "draft" mode) waiting to seed a fresh
  // create-mode editor; null once consumed. Read by NoteEditor's create-init.
  pendingDraft: PendingDraft | null;
  openEditor: (note?: Note) => void;
  // Open a blank (create-mode) editor pre-filled with `draft` for the user to refine/save.
  openWithDraft: (draft: PendingDraft) => void;
  // The editor calls this after seeding from pendingDraft, so it's used exactly once.
  consumePendingDraft: () => void;
  closeEditor: (onClose?: () => void) => void;
}

const NoteEditorContext = createContext<NoteEditorContextType | undefined>(undefined);

export const NoteEditorProvider = ({ children }: { children: ReactNode }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { cancelAll } = useGlobalAbortController();

  // Kept in memory (not in the `latest_draft_*` localStorage keys) so a chat draft never
  // clobbers the user's own unsaved new-note draft.
  const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null);

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

  const openWithDraft = (draft: PendingDraft) => {
    setPendingDraft(draft);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('noteId'); // force create mode
      next.set('editor', 'create');
      return next;
    });
  };

  const consumePendingDraft = () => setPendingDraft(null);

  const closeEditor = () => {
    setPendingDraft(null);
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
        pendingDraft,
        openEditor,
        openWithDraft,
        consumePendingDraft,
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

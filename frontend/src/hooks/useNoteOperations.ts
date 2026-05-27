import { api } from '@/integrations/api';
import type { FullNote } from '@shared/dto/GetNoteDTO';
import { useState } from 'react';
import { toast } from 'sonner';
import { useGlobalAbortController } from './useGlobalAbortController';

export const useNoteOperations = (onSuccess?: () => void) => {
  const { getSignal } = useGlobalAbortController();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);

  const generateTitle = async (content: string, signal?: AbortSignal): Promise<string | undefined> => {
    setIsFetchingTitle(true);
    try {
      const { data } = await api.post(
        '/get-note-title',
        { content },
        {
          signal: signal || getSignal(),
        }
      );
      return data.title.trim();
    } finally {
      setIsFetchingTitle(false);
    }
  };

  const getLatestDraft = () => {
    return {
      draftTitle: localStorage.getItem('latest_draft_title'),
      draftContent: localStorage.getItem('latest_draft_content'),
    };
  };

  const fetchNote = async (
    noteId: string,
    isAdmin?: boolean | null,
    signal?: AbortSignal
  ): Promise<FullNote | null> => {
    try {
      setIsLoading(true);
      const url = isAdmin ? 'get-note-admin' : 'get-note';
      const { data } = await api.get<FullNote>(url, {
        params: { noteId },
        signal: signal || getSignal(),
      });
      return data;
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        toast.error('Failed to fetch note');
      }
    } finally {
      setIsLoading(false);
    }
    return null;
  };

  // Returns true only when the note was persisted, so the caller can decide
  // whether to close the editor.
  const saveNote = async (
    noteTitle: string,
    content: string,
    noteId: string | null | undefined,
    selectedDate?: Date,
    selectedTime?: string,
    signal?: AbortSignal
  ): Promise<boolean> => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      toast.error('Please enter some content');
      return false;
    }

    setIsSaving(true);
    try {
      const requestSignal = signal || getSignal();

      let finalTitle = noteTitle?.trim() || undefined;
      if (!finalTitle) {
        finalTitle = await generateTitle(trimmedContent, requestSignal);
        if (!finalTitle) throw new Error('Could not decide on a title.');
      }

      let remindAt;
      if (selectedDate && selectedTime) {
        const [hours, minutes] = selectedTime.split(':').map(Number);
        selectedDate.setHours(hours, minutes, 0, 0);
        remindAt = selectedDate.toISOString();
      }

      const requestConfig = { signal: requestSignal };

      if (noteId) {
        // Update existing note
        await api.post(
          '/update-note',
          {
            content: trimmedContent,
            title: finalTitle,
            noteId: noteId,
            remindAt: remindAt ?? '',
          },
          requestConfig
        );
        toast.success('Note updated successfully');
      } else {
        // Create new note
        await api.post(
          '/store-note',
          {
            noteText: trimmedContent,
            title: finalTitle,
            remindAt,
          },
          requestConfig
        );
        toast.success('Note saved successfully');
        localStorage.removeItem('latest_draft_title');
        localStorage.removeItem('latest_draft_content');
      }

      onSuccess?.();
      return true;
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        if (import.meta.env.DEV) console.error('Error saving note:', error);
        toast.error('Failed to save note');
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    fetchNote,
    saveNote,
    generateTitle,
    getLatestDraft,
    isLoading,
    isSaving,
    isFetchingTitle,
  };
};

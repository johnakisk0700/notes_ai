import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNoteEditor } from '@/context/NoteEditorContext';
import { useNotes } from '@/context/NotesContext';
import { useDebouncedLocalstorageSync } from '@/hooks/useDebouncedLocalstorageSync';
import { useNoteOperations } from '@/hooks/useNoteOperations';
import { api } from '@/integrations/api';
import type { Note } from '@shared/db/schema/notes';
import type { Reminder } from '@shared/db/schema/reminders';
import { EditorContent } from '@tiptap/react';
import { format } from 'date-fns';
import { Bell, Loader2Icon, RefreshCcw, SaveIcon, Trash2Icon, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react'; // Removed useRef
import { BarLoader } from 'react-spinners';
import { toast } from 'sonner';
import AudioRecorder from '../Common/AudioRecorder';
import { useCustomTiptap } from '../Common/TiptapEditor/TiptapEditor';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { useAuth } from '@/context/AuthContext/AuthContext';
import { RealtimeAudioRecorder } from '../Common/RealtimeAudioRecorder';

export const NoteEditor = () => {
  const { isOpen, closeEditor } = useNoteEditor();

  // Handle escape key when editor is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeEditor();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeEditor]);

  return (
    <Dialog open={isOpen}>
      <DialogContent
        aria-description="Note editing content and tools."
        showCloseButton={false}
        onPressClose={() => closeEditor()}
        className="bg-secondary/60 backdrop-blur-md min-h-[100dvh] min-w-[100dvw] lg:min-h-[75dvh] lg:min-w-[60dvw] max-h-[100dvh] max-w-[100dvw] p-0 transition-none"
      >
        <EditorCore />
      </DialogContent>
    </Dialog>
  );
};

// Internal component to encapsulate the Tiptap editor logic
const EditorCore = () => {
  const { isAdmin } = useAuth();
  const [afterProcessing, setAfterProcessing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Add refs to track streaming text
  const streamingTextRef = useRef<string>('');
  const streamingPositionRef = useRef<number | null>(null);

  // utils
  const {
    isLoading: isLoadingNote,
    isSaving: isSavingNote,
    isFetchingTitle,
    saveNote,
    fetchNote,
    getLatestDraft,
    generateTitle,
  } = useNoteOperations();
  const { fetchNotes, notes } = useNotes();
  const { noteId, closeEditor, isOpen } = useNoteEditor();

  const isHttpOperationActive =
    isSavingNote || isLoadingNote || isFetchingTitle || isTranscribing || afterProcessing || !isOpen;
  const isProcessing = isSavingNote || afterProcessing;
  const editorUnavailable = isProcessing || isSavingNote || isLoadingNote;
  useEffect(() => {
    editorUnavailable ? editor?.setEditable(false) : editor?.setEditable(true);
  }, [isProcessing]);

  // Note specific
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState('12:00');
  const [noteTitle, setNoteTitle] = useState<string>('');
  const [noteToEdit, setNoteToEdit] = useState<Note | null>(null);
  const mode = noteId || noteToEdit ? 'edit' : 'create';

  // Tiptap Editor
  const debounceTimerRef = useRef<NodeJS.Timeout>(null);
  const { editor } = useCustomTiptap(newVal => {
    // save draft
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      const key = mode === 'edit' && noteId ? `${noteId}_draft_content` : 'latest_draft_content';
      localStorage.setItem(key, newVal);
    }, 400);
  });
  useDebouncedLocalstorageSync(noteTitle, mode === 'edit' && noteId ? `${noteId}_draft_title` : 'latest_draft_title');

  // util for updating both editor and state
  const updateNoteState = (title: any, content: any, reminder: Reminder | null = null) => {
    editor?.commands.setContent(content, false);
    setNoteTitle(title);
    if (reminder) {
      const date = new Date(reminder.remindAt);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      setSelectedDate(date);
      setSelectedTime(`${hours}:${minutes}`);
    }
  };

  const handleRefetchTitle = async (content: string) => {
    if (isHttpOperationActive) {
      return;
    }
    const newTitle = await generateTitle(content);
    newTitle && setNoteTitle(newTitle);
  };

  const handleStreamingText = useCallback(
    (text: string) => {
      // console.log(`Streaming chunk [${text}]`);
      if (!editor) return;

      // Remove previous streaming text if it exists
      if (streamingTextRef.current && streamingPositionRef.current !== null) {
        const currentPos = editor.state.selection.from;
        const startPos = streamingPositionRef.current;
        const endPos = startPos + streamingTextRef.current.length;

        // Only remove if cursor is at the end of the streaming text
        if (currentPos === endPos) {
          editor.chain().setTextSelection({ from: startPos, to: endPos }).deleteSelection().run();
        }
      }

      if (text) {
        // Insert new streaming text
        const currentPos = editor.state.selection.from;
        streamingPositionRef.current = currentPos;
        streamingTextRef.current = text;

        editor.chain().focus().insertContent(text).run();
      } else {
        // Clear refs when streaming stops
        streamingTextRef.current = '';
        streamingPositionRef.current = null;
      }
    },
    [editor]
  );

  const handleFinalText = useCallback(
    (text: string) => {
      // console.log(`Final chunk [${text}]`);
      if (!editor) return;

      // Remove streaming text if it exists
      if (streamingTextRef.current && streamingPositionRef.current !== null) {
        const currentPos = editor.state.selection.from;
        const startPos = streamingPositionRef.current;
        const endPos = startPos + streamingTextRef.current.length;

        // Only remove if cursor is at the end of the streaming text
        if (currentPos === endPos) {
          editor.chain().setTextSelection({ from: startPos, to: endPos }).deleteSelection().run();
        }
      }

      // Insert final text
      if (text) {
        editor
          .chain()
          .focus()
          .insertContent(text + ' ')
          .run();
      }

      // Clear refs
      streamingTextRef.current = '';
      streamingPositionRef.current = null;
    },
    [editor]
  );

  const handleTranscriptUpdate = (text: string) => {
    // Simply append the new text to the editor
    editor?.chain().focus().insertContent(text).run();
  };

  const handleSaveNote = async () => {
    if (isHttpOperationActive) {
      return;
    }

    setAfterProcessing(true);
    await saveNote(noteTitle, editor?.getText() || '', noteToEdit?.id, selectedDate, selectedTime);
    closeEditor();
    fetchNotes();
  };

  // Initialization
  useEffect(() => {
    (async () => {
      if (!isOpen) return;
      try {
        if (noteId) {
          // edit mode

          // try cached
          const maybeCached = notes.find(note => note.id === noteId);
          if (maybeCached) {
            setNoteToEdit(maybeCached);
            updateNoteState(maybeCached?.title, maybeCached?.content, maybeCached?.reminder);
            return;
          }

          // not cached, try to fetch
          const fullNote = await fetchNote(noteId, isAdmin);
          if (!fullNote) throw new Error();
          setNoteToEdit(fullNote);
          updateNoteState(fullNote?.title, fullNote?.content, fullNote?.reminder);
        } else {
          // create mode
          setNoteToEdit(null);
          const { draftTitle, draftContent } = getLatestDraft();
          updateNoteState(draftTitle || '', draftContent || '');
        }
      } catch {
        toast.error('Note was not found!');
        closeEditor();
      }
    })();
  }, [noteId, isOpen]);

  if (!editor) {
    // Optional: Show a loading state while the editor initializes
    return <div className="p-4 text-center">Loading editor...</div>;
  }

  const isReminderSet = selectedDate && selectedTime;
  return (
    <div className="grid grid-rows-[auto_auto_1fr] gap-2 p-4.5 pt-3.5 max-h-[100dvh]" tabIndex={0}>
      <DialogHeader>
        <DialogTitle hidden={true}>Note Editor</DialogTitle>
        <div className="flex gap-2">
          <Popover open={isReminderOpen} onOpenChange={setIsReminderOpen}>
            <PopoverTrigger asChild>
              {isReminderSet ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="dark:bg-sky-900/35 bg-sky-200/50 text-xs transition-none"
                >
                  {format(selectedDate, 'PP')}, {selectedTime}
                </Button>
              ) : (
                <Button variant={isReminderSet ? 'secondary' : 'outline'} size="sm">
                  <Bell />
                </Button>
              )}
            </PopoverTrigger>
            <PopoverContent align="start">
              <div className="flex flex-col gap-2.5">
                <div className="flex">
                  <Label htmlFor="time-picker" className="px-1">
                    Time:
                  </Label>{' '}
                  <Input
                    type="time"
                    id="time-picker"
                    defaultValue="10:30:00"
                    value={selectedTime}
                    onChange={e => {
                      console.log(e);
                      setSelectedTime(e.target.value);
                    }}
                    className="bg-background appearance-none w-fit ml-auto"
                  />
                </div>
                <Separator />
                <Calendar
                  mode="single"
                  className="p-0 self-center w-full"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                />

                {isReminderSet && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <div className="text-accent">Set for: </div>
                      {format(selectedDate, 'PPP')}, {selectedTime}
                    </div>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {isReminderSet ? (
            <Button
              variant="outline"
              size="sm"
              className="[>svg]:size-8"
              onClick={() => {
                setSelectedDate(undefined);
                setSelectedTime('12:00');
              }}
            >
              <Trash2Icon className="size-3" />
            </Button>
          ) : null}

          <Button className="ml-auto" variant="secondary" onClick={handleSaveNote}>
            {isSavingNote ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon />}
            {mode === 'create' ? 'Add' : 'Update'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              closeEditor();
            }}
          >
            <X />
          </Button>
        </div>
      </DialogHeader>

      <div className="flex items-center">
        <Input
          id="note_title"
          name="note_title"
          type="text"
          value={noteTitle || ''}
          onChange={e => setNoteTitle(e.target.value)}
          className="dark:bg-background/40 rounded-r-none bg-background/40 size-10.5 w-full"
          style={{ border: 0 }}
          placeholder="Title. Leave empty if you want the AI to fill it for you."
        />
        <Button
          variant="ghost"
          className="bg-background/40 rounded-l-none size-10.5"
          onClick={() => handleRefetchTitle(editor.getText().trim())}
        >
          {isFetchingTitle ? <Loader2Icon className="animate-spin" /> : <RefreshCcw />}
        </Button>
      </div>

      <div className="max-w-full max-h-full overflow-hidden relative text-sm text-foreground/90 bg-background/40">
        <RealtimeAudioRecorder
          onStreamingText={handleStreamingText}
          onFinalText={handleFinalText}
          className="absolute bottom-4 right-4 size-11 rounded-lg z-20"
          variant="default"
        />
        <EditorContent editor={editor} className={isSavingNote || afterProcessing ? `opacity-65` : ''} />
      </div>

      {isProcessing || isLoadingNote ? (
        <BarLoader
          width="100%"
          height="1px"
          color="var(--color-primary)"
          cssOverride={{ position: 'absolute', bottom: 0, left: 0 }}
        />
      ) : null}
    </div>
  );
};

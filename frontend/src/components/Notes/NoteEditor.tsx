import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNoteEditor } from '@/context/NoteEditorContext';
import { useNotes } from '@/context/NotesContext';
import { useDebouncedLocalstorageSync } from '@/hooks/useDebouncedLocalstorageSync';
import { useNoteOperations } from '@/hooks/useNoteOperations';
import type { Note } from '@shared/db/schema/notes';
import type { Reminder } from '@shared/db/schema/reminders';
import { EditorContent } from '@tiptap/react';
import { format } from 'date-fns';
import { Bell, Loader2Icon, SaveIcon, Sparkles, Trash2Icon, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BarLoader } from 'react-spinners';
import { toast } from 'sonner';
import { useCustomTiptap } from '../Common/TiptapEditor/TiptapEditor';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { useAuth } from '@/context/AuthContext/AuthContext';
import { RealtimeAudioRecorder } from '../Common/RealtimeAudioRecorder';
import { TopSpiralBinding } from '../Common/TopSpiralBinding';
import { NoteToolbar } from './NoteToolbar';

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
        className="bg-transparent h-[100dvh] min-w-[100dvw] lg:h-[80dvh] lg:min-w-[60dvw] max-h-[100dvh] max-w-[100dvw] overflow-visible rounded-none border-none p-0 shadow-xl transition-none lg:rounded-b-2xl lg:rounded-t-none"
      >
        {/* Stacked pages — a uniform little stack of paper peeking out behind the top sheet
            toward the LEFT, so the editor reads as the top sheet of a steno pad. Every leaf
            shares ONE colour (card lifted ~10% toward white — neutral, no hue smudge — so the
            stack stays visible on dark themes without reading as multi-toned) and the same
            even step; the plain dark shadow between them is what reads as separate leaves.
            z-0 keeps them under the opaque sheet (z-[1]). Desktop only. */}
        <div className="pointer-events-none absolute inset-0 z-0 hidden rounded-[inherit] lg:block" style={{ backgroundColor: 'color-mix(in srgb, var(--card) 90%, #fff)', transform: 'translate(-20px, 12px)', boxShadow: '-2px 3px 6px -1px rgba(0, 0, 0, 0.16)' }} aria-hidden />
        <div className="pointer-events-none absolute inset-0 z-0 hidden rounded-[inherit] lg:block" style={{ backgroundColor: 'color-mix(in srgb, var(--card) 90%, #fff)', transform: 'translate(-15px, 9px)', boxShadow: '-2px 3px 6px -1px rgba(0, 0, 0, 0.16)' }} aria-hidden />
        <div className="pointer-events-none absolute inset-0 z-0 hidden rounded-[inherit] lg:block" style={{ backgroundColor: 'color-mix(in srgb, var(--card) 90%, #fff)', transform: 'translate(-10px, 6px)', boxShadow: '-2px 3px 6px -1px rgba(0, 0, 0, 0.16)' }} aria-hidden />
        <div className="pointer-events-none absolute inset-0 z-0 hidden rounded-[inherit] lg:block" style={{ backgroundColor: 'color-mix(in srgb, var(--card) 90%, #fff)', transform: 'translate(-5px, 3px)', boxShadow: '-2px 3px 6px -1px rgba(0, 0, 0, 0.16)' }} aria-hidden />

        {/* The top sheet — the page you write on. Opaque card + paper grain; the stack
            shows only where this sheet doesn't cover it. Carries the background the dialog
            itself no longer paints, so it must sit above the stack (z-[1]) and below the
            content (z-10). Present on every breakpoint (mobile is just this full-bleed sheet). */}
        <div className="nb-notepad bg-card pointer-events-none absolute inset-0 z-[1] rounded-[inherit]" style={{ boxShadow: '-3px 4px 9px -3px rgba(0, 0, 0, 0.22)' }} aria-hidden />

        {/* The coil that binds the sheet at its top edge — turns the dialog into a steno pad.
            Only on lg+, where the dialog is a floating sheet; below that it's fullscreen and the
            coil would sit half-clipped against the screen edge (the seam coil hides on mobile too). */}
        <TopSpiralBinding className="hidden lg:block" />
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
  const [saveError, setSaveError] = useState(false);

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
  const { noteId, closeEditor, isOpen, pendingDraft, consumePendingDraft } = useNoteEditor();

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
    // Note content is stored as Markdown; parse it back into the editor.
    // Plain-text legacy notes are valid Markdown, so they load unchanged.
    editor?.commands.setContent(content, { emitUpdate: false, contentType: 'markdown' });
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

  // Delete the in-flight streamed transcript (if any), but only when the cursor is
  // still at its end — so the next chunk / final text replaces it cleanly without
  // clobbering edits the user made elsewhere. Shared by the streaming + final handlers.
  const removePendingStreamText = useCallback(() => {
    if (!editor || !streamingTextRef.current || streamingPositionRef.current === null) return;
    const startPos = streamingPositionRef.current;
    const endPos = startPos + streamingTextRef.current.length;
    if (editor.state.selection.from === endPos) {
      editor.chain().setTextSelection({ from: startPos, to: endPos }).deleteSelection().run();
    }
  }, [editor]);

  const handleStreamingText = useCallback(
    (text: string) => {
      if (!editor) return;

      removePendingStreamText();

      if (text) {
        // Insert new streaming text and remember where it went.
        streamingPositionRef.current = editor.state.selection.from;
        streamingTextRef.current = text;
        editor.chain().focus().insertContent(text).run();
      } else {
        // Clear refs when streaming stops.
        streamingTextRef.current = '';
        streamingPositionRef.current = null;
      }
    },
    [editor, removePendingStreamText]
  );

  const handleFinalText = useCallback(
    (text: string) => {
      if (!editor) return;

      removePendingStreamText();

      if (text) {
        editor
          .chain()
          .focus()
          .insertContent(text + ' ')
          .run();
      }

      streamingTextRef.current = '';
      streamingPositionRef.current = null;
    },
    [editor, removePendingStreamText]
  );

  const handleTranscriptUpdate = (text: string) => {
    // Simply append the new text to the editor
    editor?.chain().focus().insertContent(text).run();
  };

  const handleSaveNote = async () => {
    if (isHttpOperationActive) {
      return;
    }

    setSaveError(false);
    setAfterProcessing(true);
    // Persist as Markdown so formatting (bold/italic/lists/headings) survives.
    const saved = await saveNote(noteTitle, editor?.getMarkdown() || '', noteToEdit?.id, selectedDate, selectedTime);
    setAfterProcessing(false);
    if (saved) {
      closeEditor();
      fetchNotes();
    } else {
      // Keep the editor open so the draft isn't lost; surface the failure inline.
      setSaveError(true);
    }
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
          if (pendingDraft) {
            // A note handed in by the chat (draft_note) — seed it once, then forget it so a
            // later blank "new note" falls back to the user's own localStorage draft.
            updateNoteState(pendingDraft.title || '', pendingDraft.content || '');
            consumePendingDraft();
          } else {
            const { draftTitle, draftContent } = getLatestDraft();
            updateNoteState(draftTitle || '', draftContent || '');
          }
        }
      } catch {
        toast.error('Note was not found!');
        closeEditor();
      }
    })();
  }, [noteId, isOpen]);

  if (!editor) {
    return (
      <div className="relative z-10 flex h-full items-center justify-center p-6 text-sm text-muted-foreground">Loading editor…</div>
    );
  }

  const isReminderSet = selectedDate && selectedTime;
  return (
    <div className="relative z-10 grid h-full min-h-0 grid-rows-[auto_auto_auto_1fr] gap-3 p-4 pt-6 lg:pt-10" tabIndex={0}>
      {/* Header — reminder controls on the left, primary actions on the right */}
      <DialogHeader>
        <DialogTitle hidden={true}>Note Editor</DialogTitle>
        <div className="flex items-center gap-2">
          <Popover open={isReminderOpen} onOpenChange={setIsReminderOpen}>
            <PopoverTrigger asChild>
              {isReminderSet ? (
                <Button variant="secondary" size="sm" className="gap-1.5 bg-highlight/30 text-xs dark:bg-highlight/25">
                  <Bell className="size-3.5" />
                  {format(selectedDate, 'PP')}, {selectedTime}
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground">
                  <Bell className="size-3.5" />
                  Remind me
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
                    value={selectedTime}
                    onChange={e => setSelectedTime(e.target.value)}
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
                      <div className="text-muted-foreground">Set for: </div>
                      {format(selectedDate, 'PPP')}, {selectedTime}
                    </div>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {isReminderSet ? (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Clear reminder"
              onClick={() => {
                setSelectedDate(undefined);
                setSelectedTime('12:00');
              }}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant={saveError ? 'destructive' : 'default'}
              className="gap-2"
              onClick={handleSaveNote}
              disabled={isProcessing}
              title={saveError ? 'Saving failed — your note is still here. Try again.' : undefined}
            >
              {isSavingNote ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
              {isSavingNote ? 'Saving…' : saveError ? 'Retry save' : mode === 'create' ? 'Add note' : 'Update'}
            </Button>
            <Button variant="ghost" size="icon" title="Close" onClick={() => closeEditor()}>
              <X />
            </Button>
          </div>
        </div>
      </DialogHeader>

      {/* Title with AI fill */}
      <div className="flex items-center overflow-hidden rounded-lg bg-background/40">
        <Input
          id="note_title"
          name="note_title"
          type="text"
          value={noteTitle || ''}
          onChange={e => setNoteTitle(e.target.value)}
          className="h-11 w-full border-0 bg-transparent text-base font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
          placeholder="Title — leave empty to let AI name it"
        />
        <Button
          variant="ghost"
          size="icon"
          className="mr-1 shrink-0 text-foreground/60 hover:text-foreground"
          title="Generate a title with AI"
          disabled={isHttpOperationActive}
          onClick={() => handleRefetchTitle(editor.getText().trim())}
        >
          {isFetchingTitle ? <Loader2Icon className="animate-spin" /> : <Sparkles />}
        </Button>
      </div>

      {/* Formatting toolbar */}
      <NoteToolbar editor={editor} disabled={editorUnavailable} />

      {/* Editor surface — ruled paper, so writing sits on notebook lines */}
      <div className="nb-paper relative min-h-0 overflow-hidden rounded-lg bg-background/40 text-sm text-foreground/90">
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

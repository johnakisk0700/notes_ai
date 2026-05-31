import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNoteEditor } from '@/context/NoteEditorContext';
import { useNotes } from '@/context/NotesContext';
import { useDebouncedLocalstorageSync } from '@/hooks/useDebouncedLocalstorageSync';
import { useNoteOperations } from '@/hooks/useNoteOperations';
import type { Note } from '@shared/db/schema/notes';
import { EditorContent } from '@tiptap/react';
import { Loader2Icon, SaveIcon, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BarLoader } from 'react-spinners';
import { toast } from 'sonner';
import { useCustomTiptap } from '../Common/TiptapEditor/TiptapEditor';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
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
        {/* Stacked pages — loose leaves hanging behind the top sheet from the front binding,
            splaying LEFT and RIGHT (and down) by pre-set amounts meant to look randomly piled.
            Each leaf leans toward the side it pokes out, like a sheet swung off the coil. Colour
            is card lifted toward white (neutral — no hue smudge) by a small, gently graded
            amount (4%→10% by depth, outermost lightest so its edge against the dark backdrop
            reads); a soft downward shadow gives the hang its depth. The down-offsets stay larger
            than each leaf's tilt-lift so a rotated top corner can't peek above the bound edge.
            z-0 keeps them under the opaque sheet (z-[1]). Desktop only. */}
        <div className="pointer-events-none absolute inset-0 z-0 hidden rounded-[inherit] lg:block" style={{ backgroundColor: 'color-mix(in srgb, var(--card) 90%, #fff)', transform: 'translate(-13px, 11px) rotate(-0.6deg)', boxShadow: '0 3px 6px -1px rgba(0, 0, 0, 0.16)' }} aria-hidden />
        <div className="pointer-events-none absolute inset-0 z-0 hidden rounded-[inherit] lg:block" style={{ backgroundColor: 'color-mix(in srgb, var(--card) 92%, #fff)', transform: 'translate(9px, 16px) rotate(0.5deg)', boxShadow: '0 3px 6px -1px rgba(0, 0, 0, 0.16)' }} aria-hidden />
        <div className="pointer-events-none absolute inset-0 z-0 hidden rounded-[inherit] lg:block" style={{ backgroundColor: 'color-mix(in srgb, var(--card) 94%, #fff)', transform: 'translate(-7px, 10px) rotate(-0.4deg)', boxShadow: '0 3px 6px -1px rgba(0, 0, 0, 0.16)' }} aria-hidden />
        <div className="pointer-events-none absolute inset-0 z-0 hidden rounded-[inherit] lg:block" style={{ backgroundColor: 'color-mix(in srgb, var(--card) 96%, #fff)', transform: 'translate(11px, 13px) rotate(0.6deg)', boxShadow: '0 3px 6px -1px rgba(0, 0, 0, 0.16)' }} aria-hidden />

        {/* The top sheet — the page you write on. Opaque card + paper grain; the stack
            shows only where this sheet doesn't cover it. Carries the background the dialog
            itself no longer paints, so it must sit above the stack (z-[1]) and below the
            content (z-10). Present on every breakpoint (mobile is just this full-bleed sheet). */}
        <div className="nb-notepad bg-card pointer-events-none absolute inset-0 z-[1] rounded-[inherit]" style={{ boxShadow: '0 5px 12px -2px rgba(0, 0, 0, 0.22)' }} aria-hidden />

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

  // Cancel any pending content-draft write on unmount so it can't fire after the
  // editor closes and resurrect a draft the save already cleared from localStorage.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // util for updating both editor and state
  const updateNoteState = (title: any, content: any) => {
    // Note content is stored as Markdown; parse it back into the editor.
    // Plain-text legacy notes are valid Markdown, so they load unchanged.
    editor?.commands.setContent(content, { emitUpdate: false, contentType: 'markdown' });
    setNoteTitle(title);
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
    // Cancel the pending debounced draft write so it can't land after saveNote()
    // clears localStorage on success and bring the draft back from the dead.
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    // Persist as Markdown so formatting (bold/italic/lists/headings) survives.
    const saved = await saveNote(noteTitle, editor?.getMarkdown() || '', noteToEdit?.id);
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
            updateNoteState(maybeCached?.title, maybeCached?.content);
            return;
          }

          // not cached, try to fetch
          const fullNote = await fetchNote(noteId, isAdmin);
          if (!fullNote) throw new Error();
          setNoteToEdit(fullNote);
          updateNoteState(fullNote?.title, fullNote?.content);
        } else {
          // create mode
          setNoteToEdit(null);
          if (pendingDraft) {
            // A note handed in by the chat (create_note "draft" mode) — seed it once, then forget it
            // so a later blank "new note" falls back to the user's own localStorage draft.
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

  return (
    <div className="relative z-10 grid h-full min-h-0 grid-rows-[auto_auto_1fr] gap-3 p-4 pt-6 lg:pt-14" tabIndex={0}>
      {/* Header — primary actions on the right */}
      <DialogHeader>
        <DialogTitle hidden={true}>Note Editor</DialogTitle>
        <div className="flex items-center gap-2">
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant={saveError ? 'destructive' : 'default'}
              // Enhanced primary for the editor: a hard offset shadow makes it read as a stamped key
              // that lifts on hover and presses in on click — the theme's "stamped" ink-on-paper depth.
              className="gap-2 shadow-sm hover:shadow-md active:translate-y-px active:shadow-none"
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

      {/* Control panel — the penned title and the formatting rail framed as one stamped inset
          (.nb-panel-quiet: a SOLID graphite-tinted card, so it reads as a defined control zone
          without a translucent fill bleeding the paper grain). A separator splits the title from
          the tools; the writing field below stays open on the bare page. */}
      <div className="nb-panel-quiet flex flex-col gap-2 rounded-lg border p-2 shadow-sm">
        <div className="flex items-center gap-2">
          <Input
            id="note_title"
            name="note_title"
            type="text"
            value={noteTitle || ''}
            onChange={e => setNoteTitle(e.target.value)}
            // Penned title: borderless, straight on the paper, brand serif (the "Mneme" voice).
            // Fixed h-11 (not h-auto) lets the browser vertically centre the serif cleanly and gives
            // it breathing room; px-1.5 keeps the caret off the edge and lines the first glyph up
            // with the toolbar icons below (they're inset inside their toggles). The empty state
            // drops to a small sans hint so the placeholder isn't a giant serif line.
            className="h-11 flex-1 border-0 bg-transparent px-1.5 font-serif text-2xl font-medium tracking-tight shadow-none focus-visible:ring-0 placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:tracking-normal md:text-2xl dark:bg-transparent"
            placeholder="Untitled — leave blank to let AI name it"
          />
          {/* AI title-fill: bordered so it reads as a control, not a stray glyph on the panel. */}
          <Button
            variant="outline"
            size="icon-sm"
            className="shrink-0 text-foreground/60 hover:text-primary"
            title="Generate a title with AI"
            disabled={isHttpOperationActive}
            onClick={() => handleRefetchTitle(editor.getText().trim())}
          >
            {isFetchingTitle ? <Loader2Icon className="animate-spin" /> : <Sparkles />}
          </Button>
        </div>

        <Separator className="bg-border/70" />

        <NoteToolbar editor={editor} disabled={editorUnavailable} />
      </div>

      {/* Writing field — the open page itself; the notepad sheet (card + grain) shows straight
          through, so the text sits on paper rather than in a sunken translucent box. */}
      <div className="nb-paper relative min-h-0 overflow-hidden text-sm text-foreground/90">
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

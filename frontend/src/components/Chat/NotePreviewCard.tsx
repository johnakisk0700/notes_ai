import { useNoteEditor } from '@/context/NoteEditorContext';
import { useNotes } from '@/context/NotesContext';
import { useStreamChat } from '@/context/StreamChatContext';
import { api } from '@/integrations/api';
import { patchToolTransaction } from '@/integrations/threadMessages';
import { threadKeys } from '@/integrations/threadQueries';
import { updateToolTransaction } from '@/integrations/threads';
import { cn } from '@/lib/utils';
import type { ThreadDetail, ThreadToolTransactionStatus } from '@shared';
import type { Note } from '@shared/db/schema/notes';
import { useQueryClient } from '@tanstack/react-query';
import { diffWords } from 'diff';
import { AlertTriangle, Check, FilePen, FilePlus2, Loader2, NotebookPen, RefreshCcw, SquarePen, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { editStatusCache, resolveOutput } from './notePreviewCache';

// The note-action tools (create_note / edit_note) render as a richer "note preview" card
// instead of the generic ToolCallCard. Each tool carries a `mode` (echoed in its output)
// that selects the card's face and footer action:
//   create_note  → mode "save"   = saved note (Open)            | "draft" = opened in editor (Reopen)
//   edit_note    → mode "save"   = updated & saved (Open)       | "propose" = before→after (Apply / Discard)
// Legacy thread parts from before the consolidation (tool-propose_note_edit / tool-draft_note,
// and create/edit outputs without a `mode`) still render via the same components.
// resolveOutput/editStatusCache (notePreviewCache.ts) keep a card from regressing to a
// spinner once it has rendered — see that file.
interface ToolPart {
  type: string; // tool-create_note | tool-edit_note (+ legacy tool-propose_note_edit / tool-draft_note)
  toolCallId?: string;
  state?: string; // input-streaming | input-available | output-available | output-error
  input?: unknown;
  output?: unknown;
  errorText?: string;
  transaction?: { status?: ThreadToolTransactionStatus; updatedAt?: string };
}

const PREVIEW_CHARS = 320;

// Shown when a turn settled without ever producing this tool's result — the action never landed,
// so the card shows a terminal state instead of spinning forever.
const ACTION_INCOMPLETE = 'Η ενέργεια δεν ολοκληρώθηκε.';

function clip(text: string, max = PREVIEW_CHARS): string {
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

// Shared frame: a tinted notebook-card with an icon, label, optional title, and a footer.
function Shell({
  icon,
  label,
  title,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="my-2 overflow-hidden rounded-lg border nb-panel text-sm not-prose">
      <div className="flex items-center gap-2 border-b border-primary/10 px-3 py-1.5">
        <span className="shrink-0 text-primary/80">{icon}</span>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
        {title ? <span className="truncate font-medium text-foreground">{title}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Body({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn('max-h-44 overflow-auto whitespace-pre-wrap px-3 py-2 text-[13px] leading-5 text-foreground/90', className)}>
      {clip(text)}
    </p>
  );
}

function Running({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Shell icon={icon} label={label}>
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        <span>…</span>
      </div>
    </Shell>
  );
}

function ErrorCard({ label, text }: { label: string; text?: string }) {
  return (
    <Shell icon={<AlertTriangle className="size-4 text-destructive" />} label={label} title="">
      <p className="px-3 py-2 text-xs text-destructive">{text || 'Κάτι πήγε στραβά.'}</p>
    </Shell>
  );
}

// A persisted assistant turn surfaces its 24-hex generationId as its message id; the live useChat
// overlay assigns its own local id (not 24-hex). So a non-ObjectId id means we're acting on the
// turn that's streaming right now.
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function usePersistToolTransaction(messageId: string, part: ToolPart) {
  const { threadId, streamingGenerationId } = useStreamChat();
  const queryClient = useQueryClient();

  return async (status: ThreadToolTransactionStatus, output?: unknown) => {
    // The server persists tool decisions keyed by generationId. When the click happens mid-stream
    // the rendered messageId is the SDK's local id, which matches no placeholder — substitute the
    // streaming turn's generationId so an Apply/Discard during streaming still persists (and so it
    // survives a refresh, as documented). Persisted/seeded turns already carry the generationId.
    const persistId = OBJECT_ID_RE.test(messageId) ? messageId : streamingGenerationId;
    if (!threadId || !part.toolCallId || !persistId) return;
    const optimistic = { status, updatedAt: new Date().toISOString() };
    queryClient.setQueryData<ThreadDetail>(threadKeys.detail(threadId), prev =>
      patchToolTransaction(prev, persistId, part.toolCallId!, optimistic, output)
    );

    try {
      const transaction = await updateToolTransaction({
        threadId,
        messageId: persistId,
        toolCallId: part.toolCallId,
        status,
        output,
      });
      queryClient.setQueryData<ThreadDetail>(threadKeys.detail(threadId), prev =>
        patchToolTransaction(prev, persistId, part.toolCallId!, transaction, output)
      );
    } catch {
      // The note action already succeeded. Keep the in-session state even if
      // Mongo is briefly unavailable; the next thread fetch will reconcile.
    }
  };
}

// --- create_note: saved (mode "save") or drafted (mode "draft") ----------------------
interface CreatedOutput {
  mode?: 'save' | 'draft';
  saved?: boolean;
  openedInEditor?: boolean;
  noteId?: string;
  title?: string;
  content?: string;
  error?: string;
}

interface SavedNote {
  noteId?: string;
  title?: string;
  content?: string;
}

// The success face of a persisted note — shared by create (saved) and edit (updated), each
// from the tool itself or a manual retry. `label` distinguishes "Αποθηκεύτηκε" vs "Ενημερώθηκε".
function SavedNoteShell({ note, label = 'Αποθηκεύτηκε' }: { note: SavedNote; label?: string }) {
  const { openEditor } = useNoteEditor();
  return (
    <Shell icon={<Check className="size-4 text-emerald-600" />} label={label} title={note.title}>
      {note.content ? <Body text={note.content} /> : null}
      <div className="flex justify-end gap-1.5 px-3 pb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => note.noteId && openEditor({ id: note.noteId } as unknown as Note)}
        >
          <SquarePen className="size-3.5" />
          Άνοιγμα
        </Button>
      </div>
    </Shell>
  );
}

// The failure face shared by create-save and edit-save: the error plus a deterministic Retry
// that re-hits the relevant endpoint directly (no model). Safe to repeat — a failed write
// rolls back, so a retry can't leave a duplicate (create) and an update is idempotent (edit).
function SaveFailureCard({
  label,
  title,
  error,
  retrying,
  onRetry,
}: {
  label: string;
  title?: string;
  error?: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <Shell icon={<AlertTriangle className="size-4 text-destructive" />} label={label} title={title}>
      <p className="px-3 pt-2 text-xs text-destructive">{error || 'Η σημείωση δεν αποθηκεύτηκε.'}</p>
      <div className="flex justify-end gap-1.5 px-3 pb-2 pt-1.5">
        <Button variant="outline" size="sm" disabled={retrying} onClick={onRetry}>
          {retrying ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCcw className="size-3.5" />}
          Δοκίμασε ξανά
        </Button>
      </div>
    </Shell>
  );
}

function CreatedNoteCard({ part, messageId, settled }: { part: ToolPart; messageId: string; settled: boolean }) {
  const { fetchNotes } = useNotes();
  const out = resolveOutput<CreatedOutput>(part);
  // The original tool input carries the note text + chosen mode — used to pick the right
  // running label before output arrives, and to re-attempt the save on retry.
  const input = part.input as { title?: string; content?: string; mode?: 'save' | 'draft' } | undefined;
  const [retrying, setRetrying] = useState(false);
  const [retried, setRetried] = useState<SavedNote | null>(null);
  const persistTransaction = usePersistToolTransaction(messageId, part);

  // "draft" mode opens the note in the editor instead of saving — render the draft face
  // (known from the output, or early from the model's chosen input mode while it streams).
  if (out?.mode === 'draft' || out?.openedInEditor || input?.mode === 'draft') {
    return <DraftNoteCard part={part} settled={settled} />;
  }

  // Saved note, from the tool itself or from a successful manual retry.
  const saved: SavedNote | null =
    retried ?? (out?.saved ? { noteId: out.noteId, title: out.title, content: out.content } : null);
  if (saved) return <SavedNoteShell note={saved} />;

  // Failed = the tool reported saved:false, or the call errored with no usable output.
  const failed = out?.saved === false || (part.state === 'output-error' && !out);
  if (!failed) {
    // The turn ended without a result for this save — show a terminal error, not a forever-spinner.
    // (No retry here: a no-output save is ambiguous, so re-posting could risk a duplicate; an
    // explicit saved:false below keeps its safe retry.)
    if (settled) return <ErrorCard label="Αποθήκευση σημείωσης" text={ACTION_INCOMPLETE} />;
    return <Running icon={<FilePlus2 className="size-4" />} label="Αποθήκευση σημείωσης…" />;
  }

  // Deterministic retry: re-hit the create endpoint directly (no model). Safe to repeat —
  // a failed create rolls back its transaction, so this can't leave a duplicate/orphan.
  const retry = async () => {
    if (!input?.content) {
      toast.error('Λείπει το περιεχόμενο για επανάληψη');
      return;
    }
    setRetrying(true);
    try {
      const { data } = await api.post('/store-note', { noteText: input.content, title: input.title });
      const saved = { noteId: data?.id, title: input.title, content: input.content };
      setRetried(saved);
      toast.success('Η σημείωση αποθηκεύτηκε');
      fetchNotes();
      void persistTransaction('retry_saved', {
        mode: 'save',
        saved: true,
        noteId: saved.noteId,
        title: saved.title,
        content: saved.content,
        date: data?.created_at,
      });
    } catch {
      toast.error('Απέτυχε ξανά — δοκίμασε αργότερα');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <SaveFailureCard
      label="Αποτυχία αποθήκευσης"
      title={input?.title}
      error={out?.error || part.errorText}
      retrying={retrying}
      onRetry={retry}
    />
  );
}

// --- edit_note: applied & saved (mode "save") or a before→after proposal (mode "propose") ---
interface EditOutput {
  found?: boolean;
  mode?: 'propose' | 'save';
  saved?: boolean;
  // The server's one-edit-per-note-per-turn guard collapsed this duplicate (a propose+save on the
  // same note in one turn) — render nothing for it.
  skipped?: boolean;
  noteId?: string;
  title?: string;
  before?: string;
  after?: string;
  content?: string;
  error?: string;
}

// A compact word-level diff (jsdiff `diffWords`, Unicode-aware so Greek tokenizes by word):
// unchanged text stays muted, removed words are struck through in red, added words tinted
// green — so a small edit reads as a small change instead of two full copies of the note.
function InlineDiff({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  return (
    <p className="max-h-44 overflow-auto whitespace-pre-wrap px-3 py-2 text-[13px] leading-5 text-foreground/75">
      {parts.map((part, i) => {
        if (part.added)
          return (
            <span key={i} className="rounded-[2px] bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
              {part.value}
            </span>
          );
        if (part.removed)
          return (
            <span key={i} className="rounded-[2px] bg-destructive/10 text-muted-foreground line-through decoration-destructive/40">
              {part.value}
            </span>
          );
        return <span key={i}>{part.value}</span>;
      })}
    </p>
  );
}

// mode "save": the edit was written immediately — render the terminal saved face (or a
// retryable failure). The model picks this when the user clearly wants the change committed.
function EditSavedFace({ part, messageId, settled }: { part: ToolPart; messageId: string; settled: boolean }) {
  const { fetchNotes } = useNotes();
  const out = resolveOutput<EditOutput>(part);
  const input = part.input as { noteId?: string; newContent?: string; title?: string } | undefined;
  const [retrying, setRetrying] = useState(false);
  const [retried, setRetried] = useState<SavedNote | null>(null);
  const persistTransaction = usePersistToolTransaction(messageId, part);

  // Duplicate edit collapsed by the per-turn guard — render nothing.
  if (out?.skipped) return null;

  const saved: SavedNote | null =
    retried ?? (out?.saved ? { noteId: out.noteId, title: out.title, content: out.content } : null);
  if (saved) return <SavedNoteShell note={saved} label="Ενημερώθηκε" />;

  // No output yet — the model picked "save" and we routed here early (off the streaming input mode),
  // before the result arrived. Show a pending state, NOT the failure card (mirrors CreatedNoteCard);
  // otherwise the card flashes "Αποτυχία" for a moment before flipping to saved (the flicker bug).
  const failed = out?.saved === false || (part.state === 'output-error' && !out);
  if (!failed) {
    // Turn ended with no result for this save — terminal error instead of a forever-spinner.
    if (settled) return <ErrorCard label="Αποθήκευση αλλαγής" text={ACTION_INCOMPLETE} />;
    return <Running icon={<FilePen className="size-4" />} label="Αποθήκευση αλλαγής…" />;
  }

  // Deterministic retry: re-hit /update-note directly (no model). An update is idempotent.
  const retry = async () => {
    if (!input?.noteId || input.newContent === undefined) {
      toast.error('Λείπει το περιεχόμενο για επανάληψη');
      return;
    }
    setRetrying(true);
    try {
      await api.post('/update-note', { noteId: input.noteId, content: input.newContent, title: input.title });
      const saved = { noteId: input.noteId, title: input.title, content: input.newContent };
      setRetried(saved);
      toast.success('Η σημείωση ενημερώθηκε');
      fetchNotes();
      void persistTransaction('retry_saved', { found: true, mode: 'save', ...saved });
    } catch {
      toast.error('Απέτυχε ξανά — δοκίμασε αργότερα');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <SaveFailureCard
      label="Αποτυχία ενημέρωσης"
      title={out?.title || input?.title}
      error={out?.error || part.errorText}
      retrying={retrying}
      onRetry={retry}
    />
  );
}

function EditNoteCard({ part, messageId, settled }: { part: ToolPart; messageId: string; settled: boolean }) {
  const id = part.toolCallId;
  const { fetchNotes } = useNotes();
  const out = resolveOutput<EditOutput>(part);
  const inputMode = (part.input as { mode?: 'propose' | 'save' } | undefined)?.mode;
  const [status, setStatus] = useState<'idle' | 'applying' | 'applied' | 'discarded'>(
    () =>
      (part.transaction?.status === 'applied' || part.transaction?.status === 'discarded'
        ? part.transaction.status
        : id && editStatusCache.get(id)) || 'idle'
  );
  const persistTransaction = usePersistToolTransaction(messageId, part);

  if (out?.skipped) return null; // duplicate edit collapsed by the per-turn guard — render nothing
  if (part.state === 'output-error' && !out) return <ErrorCard label="Επεξεργασία σημείωσης" text={part.errorText} />;
  if (out?.found === false) return <ErrorCard label="Επεξεργασία σημείωσης" text="Η σημείωση δεν βρέθηκε." />;
  // "save" mode (known from output, or early from the model's chosen input mode) → saved face.
  if (out?.mode === 'save' || out?.saved !== undefined || (!out && inputMode === 'save')) {
    return <EditSavedFace part={part} messageId={messageId} settled={settled} />;
  }
  if (!out) {
    // Turn ended before the proposal was prepared — terminal error instead of a forever-spinner.
    if (settled) return <ErrorCard label="Επεξεργασία σημείωσης" text={ACTION_INCOMPLETE} />;
    return <Running icon={<FilePen className="size-4" />} label="Ετοιμασία αλλαγής…" />;
  }

  const apply = async () => {
    if (!out.noteId) return;
    setStatus('applying');
    try {
      await api.post('/update-note', {
        noteId: out.noteId,
        content: out.after ?? '',
        title: out.title,
      });
      if (id) editStatusCache.set(id, 'applied');
      setStatus('applied');
      toast.success('Η σημείωση ενημερώθηκε');
      fetchNotes();
      void persistTransaction('applied', out);
    } catch {
      setStatus('idle');
      toast.error('Αποτυχία ενημέρωσης');
    }
  };

  const discard = () => {
    if (id) editStatusCache.set(id, 'discarded');
    setStatus('discarded');
    void persistTransaction('discarded', out);
  };

  return (
    <Shell icon={<FilePen className="size-4" />} label="Πρόταση αλλαγής" title={out.title}>
      {/* Word-level diff: only the changed words are highlighted, with a tiny legend. */}
      <div className="flex items-center gap-2.5 border-b border-primary/10 px-3 py-1 text-[10px] text-muted-foreground">
        <span className="line-through decoration-destructive/40">αφαίρεση</span>
        <span className="text-emerald-700 dark:text-emerald-400">προσθήκη</span>
      </div>
      <InlineDiff before={out.before ?? ''} after={out.after ?? ''} />
      <div className="flex items-center justify-end gap-1.5 px-3 pb-2">
        {status === 'applied' ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <Check className="size-3.5" /> Εφαρμόστηκε
          </span>
        ) : status === 'discarded' ? (
          <span className="text-xs text-muted-foreground">Ακυρώθηκε</span>
        ) : (
          <>
            <Button variant="ghost" size="sm" disabled={status === 'applying'} onClick={discard}>
              <X className="size-3.5" />
              Ακύρωση
            </Button>
            <Button size="sm" disabled={status === 'applying'} onClick={apply}>
              {status === 'applying' ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Εφαρμογή
            </Button>
          </>
        )}
      </div>
    </Shell>
  );
}

// --- The draft face: create_note mode "draft" (and the legacy standalone draft_note) -----
interface DraftOutput {
  openedInEditor?: boolean;
  title?: string;
  content?: string;
}

function DraftNoteCard({ part, settled }: { part: ToolPart; settled: boolean }) {
  const { openWithDraft } = useNoteEditor();
  const out = resolveOutput<DraftOutput>(part);

  if (part.state === 'output-error' && !out) return <ErrorCard label="Πρόχειρη σημείωση" text={part.errorText} />;
  if (!out?.openedInEditor) {
    // Turn ended before the draft was prepared — terminal error instead of a forever-spinner.
    if (settled) return <ErrorCard label="Πρόχειρη σημείωση" text={ACTION_INCOMPLETE} />;
    return <Running icon={<NotebookPen className="size-4" />} label="Ετοιμασία προσχεδίου…" />;
  }

  return (
    <Shell icon={<NotebookPen className="size-4" />} label="Πρόχειρο στον editor" title={out.title}>
      {out.content ? <Body text={out.content} /> : null}
      <div className="flex justify-end gap-1.5 px-3 pb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => openWithDraft({ title: out.title ?? '', content: out.content ?? '' })}
        >
          <SquarePen className="size-3.5" />
          Άνοιγμα ξανά
        </Button>
      </div>
    </Shell>
  );
}

export const NotePreviewCard = ({
  part,
  messageId,
  settled,
}: {
  part: ToolPart;
  messageId: string;
  settled: boolean;
}) => {
  switch (part.type) {
    case 'tool-create_note':
      return <CreatedNoteCard part={part} messageId={messageId} settled={settled} />;
    case 'tool-propose_edit': // before→after review card (writes nothing; user Applies)
    case 'tool-edit_note': // legacy unified edit (mode-based)
    case 'tool-propose_note_edit': // legacy name (pre create/edit consolidation)
      return <EditNoteCard part={part} messageId={messageId} settled={settled} />;
    case 'tool-save_edit': // immediate write → saved / failure face
      return <EditSavedFace part={part} messageId={messageId} settled={settled} />;
    case 'tool-draft_note': // legacy standalone draft (now create_note mode "draft")
      return <DraftNoteCard part={part} settled={settled} />;
    default:
      return null;
  }
};

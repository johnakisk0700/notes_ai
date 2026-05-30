import { useNoteEditor } from '@/context/NoteEditorContext';
import { useNotes } from '@/context/NotesContext';
import { api } from '@/integrations/api';
import { cn } from '@/lib/utils';
import type { Note } from '@shared/db/schema/notes';
import { AlertTriangle, Check, FilePen, FilePlus2, Loader2, NotebookPen, SquarePen, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';

// The note-action tools (create_note / propose_note_edit / draft_note) render as a richer
// "note preview" card instead of the generic ToolCallCard: each shows the note and a footer
// action that matches its mode (open the saved note / apply an edit / open in the editor).
interface ToolPart {
  type: string; // tool-create_note | tool-propose_note_edit | tool-draft_note
  state?: string; // input-streaming | input-available | output-available | output-error
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

const PREVIEW_CHARS = 320;

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
    <div className="my-2 overflow-hidden rounded-lg border border-primary/20 bg-primary/[0.04] text-sm not-prose">
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

// --- Mode 1: created & saved ---------------------------------------------------------
interface CreatedOutput {
  saved?: boolean;
  noteId?: string;
  title?: string;
  content?: string;
}

function CreatedNoteCard({ part }: { part: ToolPart }) {
  const { openEditor } = useNoteEditor();
  const out = part.output as CreatedOutput | undefined;

  if (part.state === 'output-error') return <ErrorCard label="Αποθήκευση σημείωσης" text={part.errorText} />;
  if (!out?.saved) return <Running icon={<FilePlus2 className="size-4" />} label="Αποθήκευση σημείωσης…" />;

  return (
    <Shell icon={<Check className="size-4 text-emerald-600" />} label="Αποθηκεύτηκε" title={out.title}>
      {out.content ? <Body text={out.content} /> : null}
      <div className="flex justify-end gap-1.5 px-3 pb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => out.noteId && openEditor({ id: out.noteId } as unknown as Note)}
        >
          <SquarePen className="size-3.5" />
          Άνοιγμα
        </Button>
      </div>
    </Shell>
  );
}

// --- Mode 2: proposed edit (Apply / Discard) -----------------------------------------
interface EditOutput {
  found?: boolean;
  noteId?: string;
  title?: string;
  before?: string;
  after?: string;
  remindAt?: string;
}

function EditProposalCard({ part }: { part: ToolPart }) {
  const { fetchNotes } = useNotes();
  const [status, setStatus] = useState<'idle' | 'applying' | 'applied' | 'discarded'>('idle');
  const out = part.output as EditOutput | undefined;

  if (part.state === 'output-error') return <ErrorCard label="Επεξεργασία σημείωσης" text={part.errorText} />;
  if (!out) return <Running icon={<FilePen className="size-4" />} label="Ετοιμασία αλλαγής…" />;
  if (out.found === false)
    return <ErrorCard label="Επεξεργασία σημείωσης" text="Η σημείωση δεν βρέθηκε." />;

  const apply = async () => {
    if (!out.noteId) return;
    setStatus('applying');
    try {
      // Forward the existing remindAt so a content-only edit doesn't wipe the reminder.
      await api.post('/update-note', {
        noteId: out.noteId,
        content: out.after ?? '',
        title: out.title,
        remindAt: out.remindAt || '',
      });
      setStatus('applied');
      toast.success('Η σημείωση ενημερώθηκε');
      fetchNotes();
    } catch {
      setStatus('idle');
      toast.error('Αποτυχία ενημέρωσης');
    }
  };

  return (
    <Shell icon={<FilePen className="size-4" />} label="Πρόταση αλλαγής" title={out.title}>
      <div className="space-y-1.5 px-3 py-2">
        <div className="rounded-md border border-destructive/20 bg-destructive/5">
          <span className="block px-2 pt-1 text-[10px] font-medium uppercase tracking-wide text-destructive/70">Πριν</span>
          <p className="max-h-28 overflow-auto whitespace-pre-wrap px-2 pb-1.5 text-[13px] leading-5 text-muted-foreground line-through decoration-destructive/30">
            {clip(out.before ?? '', 200)}
          </p>
        </div>
        <div className="rounded-md border border-emerald-600/20 bg-emerald-500/5">
          <span className="block px-2 pt-1 text-[10px] font-medium uppercase tracking-wide text-emerald-700/70">Μετά</span>
          <p className="max-h-36 overflow-auto whitespace-pre-wrap px-2 pb-1.5 text-[13px] leading-5 text-foreground/90">
            {clip(out.after ?? '')}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 px-3 pb-2">
        {status === 'applied' ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <Check className="size-3.5" /> Εφαρμόστηκε
          </span>
        ) : status === 'discarded' ? (
          <span className="text-xs text-muted-foreground">Ακυρώθηκε</span>
        ) : (
          <>
            <Button variant="ghost" size="sm" disabled={status === 'applying'} onClick={() => setStatus('discarded')}>
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

// --- Mode 3: draft opened in the editor ----------------------------------------------
interface DraftOutput {
  openedInEditor?: boolean;
  title?: string;
  content?: string;
}

function DraftNoteCard({ part }: { part: ToolPart }) {
  const { openWithDraft } = useNoteEditor();
  const out = part.output as DraftOutput | undefined;

  if (part.state === 'output-error') return <ErrorCard label="Πρόχειρη σημείωση" text={part.errorText} />;
  if (!out?.openedInEditor) return <Running icon={<NotebookPen className="size-4" />} label="Ετοιμασία προσχεδίου…" />;

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

export const NotePreviewCard = ({ part }: { part: ToolPart }) => {
  switch (part.type) {
    case 'tool-create_note':
      return <CreatedNoteCard part={part} />;
    case 'tool-propose_note_edit':
      return <EditProposalCard part={part} />;
    case 'tool-draft_note':
      return <DraftNoteCard part={part} />;
    default:
      return null;
  }
};

import { useNoteEditor } from '@/context/NoteEditorContext';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { CustomMarkdown } from '../Chat/CustomMarkdown';
import type { FullNote } from '@shared/dto/GetNoteDTO';

interface NoteComponentProps {
  note: FullNote;
  handleDelete: (noteId: string) => void;
}

export const NoteComponent = ({ note, handleDelete }: NoteComponentProps) => {
  const { openEditor } = useNoteEditor();
  return (
    <Card className="group relative w-full max-h-[12rem] shrink-0 gap-1.5 overflow-hidden rounded-md p-3.5">
      {/* Heading — title and dated stamp; actions reveal on hover */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-foreground">{note.title}</h3>
          <span className="mt-0.5 block font-mono text-[0.6rem] tracking-tight text-muted-foreground">
            {formatDisplayDate(note.created_at)}
          </span>
        </div>

        <div className="flex shrink-0 gap-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          <Button onClick={() => openEditor(note)} variant="ghost" size="icon-xs" title="Edit">
            <Pencil className="text-primary/60" />
          </Button>
          <Button
            onClick={() => handleDelete(note.id)}
            variant="ghost"
            size="icon-xs"
            title="Delete"
            className="hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* Preview — flush text behind an ink margin rule, no box-in-a-box */}
      <div className="note-md overflow-hidden border-l-2 border-border pl-2.5 text-xs text-foreground/55">
        <CustomMarkdown>{note.content}</CustomMarkdown>
      </div>
    </Card>
  );
};

function formatDisplayDate(dateString: string | Date) {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

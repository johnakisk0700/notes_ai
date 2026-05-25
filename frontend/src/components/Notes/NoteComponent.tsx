import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNoteEditor } from '@/context/NoteEditorContext';
import { BellIcon, DotIcon, Pencil, Trash2 } from 'lucide-react'; // Replace with your actual icon library imports
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';
import type { FullNote } from '@shared/dto/GetNoteDTO';

interface NoteComponentProps {
  note: FullNote;
  handleDelete: (noteId: string) => void;
}

export const NoteComponent = ({ note, handleDelete }: NoteComponentProps) => {
  const { openEditor } = useNoteEditor();
  const { reminder } = note;
  return (
    <Card className="p-3.5 relative pr-[3rem] max-h-[12rem] gap-1.5 shrink-0 rounded-md w-full">
      <CardHeader className="pl-0 text-sm">
        <CardTitle className="mb-2.5">
          <div className="flex items-center">
            <DotIcon className="size-7" />
            <div>
              {note.title}
              <span className="text-[0.6rem] font-light text-foreground/75 mt-1.5 flex absolute">
                {formatDisplayDate(note.created_at)}
              </span>
            </div>
          </div>

          {/* <p className="text-[0.55rem] font-light text-foreground/75">{formatDisplayDate(note.updated_at)}</p> */}
        </CardTitle>
      </CardHeader>

      <CardContent className="overflow-y-hidden flex-grow p-2.5 rounded-lg mr-5 text-xs text-foreground/50 border-1 bg-background">
        {note.content}
      </CardContent>
      {reminder && (
        <Tooltip>
          <TooltipTrigger className="absolute top-0 right-[3.5rem]">
            <Badge
              className=" rounded-t-none bg-sky-500 dark:bg-sky-950 dark:text-foreground items-center size-5 w-fit"
              variant="default"
            >
              <BellIcon className="translate-y-[1px] mr-1" />
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="">{formatDisplayDate(reminder.remindAt.toString())}</TooltipContent>
        </Tooltip>
      )}
      <div className="flex flex-col absolute right-0 top-0 w-[3rem] h-full border-l-1">
        <Button onClick={() => openEditor(note)} variant="ghost" className="flex-grow rounded-t-none rounded-bl-none">
          <Pencil size={16} className="text-primary/50" />
        </Button>
        <Separator />
        <Button
          variant="ghost"
          className="flex-grow dark:hover:bg-destructive/20 hover:bg-destructive/50 rounded-t-none rounded-bl-none"
          onClick={() => handleDelete(note.id)}
        >
          <Trash2 size={16} className="text-primary/50" />
        </Button>
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

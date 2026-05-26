import NotesList from '@/components/Notes/NotesList';
import { cn } from '@/lib/utils';

export const NotesPage = () => {
  return (
    <div className={cn('nb-paper h-full w-full overflow-y-scroll hide-scrollbar')}>
      <NotesList />
    </div>
  );
};

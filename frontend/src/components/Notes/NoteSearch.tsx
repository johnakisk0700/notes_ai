import { useNotes } from '@/context/NotesContext';
import { type ComponentProps } from 'react';
import { Input } from '../ui/input';
import { cn } from '@/lib/utils';

export const NoteSearch = ({ className, ...props }: ComponentProps<typeof Input>) => {
  const { handleChangeSearch, searchQuery } = useNotes();
  return (
    <Input
      id="search-notes-input"
      placeholder="Search through your notes"
      onChange={e => handleChangeSearch(e.target.value)}
      value={searchQuery}
      // Transparent so it blends into the frosted search bar / paper, instead of painting the
      // Input's default dark fill (dark:bg-input/30) as a separate block on the page.
      className={cn('h-10 bg-transparent dark:bg-transparent', className)}
      {...props}
    />
  );
};

import { useNotes } from '@/context/NotesContext';
import { type ComponentProps } from 'react';
import { Input } from '../ui/input';

interface NoteSearchProps {}

export const NoteSearch = ({ ...props }: NoteSearchProps & ComponentProps<typeof Input>) => {
  const { handleChangeSearch, searchQuery } = useNotes();
  return (
    <Input
      id="search-notes-input"
      placeholder="Search through your notes"
      onChange={e => handleChangeSearch(e.target.value)}
      value={searchQuery}
      className="h-10"
      {...props}
    />
  );
};

import { api } from '@/integrations/api';
import { type FullNote, type GetNoteDTO } from '@shared/dto/GetNoteDTO';
import { debounce } from 'lodash';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface NotesContextType {
  notes: FullNote[];
  filteredNotes: FullNote[];
  searchQuery: string;
  isLoading: boolean; // Add this
  fetchNotes: () => Promise<void>;
  handleChangeSearch: (v: string) => void;
}

const NotesContext = createContext<NotesContextType>({
  notes: [],
  filteredNotes: [],
  searchQuery: '',
  isLoading: false, // Add this
  fetchNotes: async () => {},
  handleChangeSearch: () => {},
});

export function NotesProvider({ children }) {
  const [notes, setNotes] = useState<FullNote[] | []>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filteredNotes, setFilteredNotes] = useState(notes); // Store original notes

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    setIsLoading(true);
    try {
      const {
        data: { data },
      } = await api.get<GetNoteDTO>('get-notes');
      setNotes(data);
    } finally {
      setIsLoading(false);
    }
  };

  // Everytime we refetch, we do the search again.
  useEffect(() => {
    performSearch(query);
  }, [notes]);

  const performSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setFilteredNotes(notes);
      return;
    }

    const filtered = notes.filter(
      note =>
        note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredNotes(filtered);
  };

  const debouncedSearch = useCallback(debounce(performSearch, 300), [notes, setFilteredNotes]);

  const handleChange = (value: string) => {
    setQuery(value);
    debouncedSearch(value);
  };

  const value = {
    notes,
    filteredNotes,
    fetchNotes,
    isLoading,
    searchQuery: query,
    handleChangeSearch: handleChange,
  };

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  return useContext(NotesContext);
}

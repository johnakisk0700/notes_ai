import React from 'react';
import { NoteComponent } from '../Notes/NoteComponent';
import { Badge } from '../ui/badge';

interface AdminNotesListProps {
  userIdentifier: string;
  notes: any[];
}

export const AdminNotesList: React.FC<AdminNotesListProps> = ({ userIdentifier, notes }) => {
  return (
    <div className="flex flex-col gap-3 pb-16 shrink-0 w-full max-w-5xl mx-auto">
      <Badge className="size-10 w-fit">{userIdentifier}</Badge>
      {notes?.map(note => <NoteComponent key={note.id} note={note} handleDelete={() => {}} />)}
    </div>
  );
};

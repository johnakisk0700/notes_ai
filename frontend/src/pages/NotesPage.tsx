import NotesList from '@/components/Notes/NotesList';
import { NotesHeader } from '@/components/Notes/NotesHeader';
import { Page } from '@/components/Common/Page';

export const NotesPage = () => {
  // No Page `title`: NotesHeader owns the dated heading so it can stay sticky and carry the
  // search. `pt-0` lets that header sit flush at the top of the scroll surface.
  return (
    <Page width="full" contentClassName="pt-0">
      <NotesHeader />
      <NotesList />
    </Page>
  );
};

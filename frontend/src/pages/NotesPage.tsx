import NotesList from '@/components/Notes/NotesList';
import { Page } from '@/components/Common/Page';
import { useTranslation } from 'react-i18next';

export const NotesPage = () => {
  const { t } = useTranslation();
  return (
    <Page width="full" title={t('personal_notes')}>
      <NotesList />
    </Page>
  );
};

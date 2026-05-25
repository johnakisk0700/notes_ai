import suggestionConfiguration from '@/components/Common/TiptapEditor/suggestions';
import { useUsersContext } from '@/context/UsersContext/UsersProvider';
import Document from '@tiptap/extension-document';
import Mention from '@tiptap/extension-mention';
import Paragraph from '@tiptap/extension-paragraph';
import { Placeholder } from '@tiptap/extensions';
import Text from '@tiptap/extension-text';
import { useEditor } from '@tiptap/react';
import Fuse from 'fuse.js';
import debounce from 'lodash/debounce';
import { useMemo } from 'react';

export const useCustomTiptap = (onUpdate: (text: string) => void) => {
  const users = useUsersContext();

  const suggestionList = useMemo(() => {
    return users ? users.map(x => x.userIdentifier) : [];
  }, [users]);

  const fuse = useMemo(() => new Fuse(suggestionList, { threshold: 0.25 }), [suggestionList]);

  const debouncedSearch = useMemo(
    () =>
      debounce((query, resolve) => {
        const results = fuse.search(query);
        resolve(results.map(result => result.item));
      }, 500),
    [fuse]
  );

  const suggestionConfig = useMemo(
    () => ({
      ...suggestionConfiguration,
      items: ({ query }) => {
        return new Promise<string[]>(resolve => {
          if (!suggestionList || suggestionList.length === 0) {
            resolve([]);
            return;
          }
          if (!query) {
            resolve(suggestionList);
            return;
          }
          if (!fuse) {
            resolve(suggestionList);
            return;
          }
          debouncedSearch(query, resolve);
        });
      },
    }),
    [suggestionList, fuse, debouncedSearch]
  );

  const extensions = useMemo(
    () => [
      Document,
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: suggestionConfig,
      }),
      Paragraph,
      Text,
      Placeholder.configure({
        placeholder: 'Dear diary...',
      }),
    ],
    [suggestionConfig]
  );

  const editor = useEditor({
    extensions,
    onUpdate: ({ editor }) => onUpdate(editor.getText()),
  });

  return { editor };
};

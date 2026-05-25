import { useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import debounce from 'lodash/debounce';
import { useEditor } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Mention from '@tiptap/extension-mention';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import suggestionConfiguration from '@/components/Common/TiptapEditor/suggestions';
import Placeholder from '@tiptap/extension-placeholder'; // Add this import

export const useTiptapEditor = (suggestionList, setBoundState) => {
  // Create a Fuse instance to enable fuzzy searching.
  const fuse = useMemo(() => new Fuse(suggestionList, { threshold: 0.25 }), [suggestionList]); // Create a debounced function for fuzzy search.

  const debouncedSearch = useMemo(
    () =>
      debounce((query, resolve) => {
        const results = fuse.search(query);
        resolve(results.map(result => result.item));
      }, 500),
    [fuse]
  );

  // Define the suggestion configuration.
  // The items function now returns a Promise that resolves with an array of suggestions.
  const suggestionConfig = useMemo(
    () => ({
      ...suggestionConfiguration,
      items: ({ query }) => {
        return new Promise<string[]>(resolve => {
          if (!suggestionList || suggestionList.length === 0) {
            resolve([]);
            return;
          } // When there's no query, return all items.
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
    [suggestionConfig] // Rebuild extensions when suggestionConfig changes
  );

  const editor = useEditor(
    {
      extensions,
      onUpdate: ({ editor }) => {
        setBoundState(editor.getText());
      },
    },
    [extensions]
  );
  return { editor };
};

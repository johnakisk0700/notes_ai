import suggestionConfiguration from '@/components/Common/TiptapEditor/suggestions';
import { useUsersContext } from '@/context/UsersContext/UsersProvider';
import { useWineContext } from '@/context/WineContext/WineProvider';
import { useCustomerContext } from '@/context/CustomerProvider';
import Mention from '@tiptap/extension-mention';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { useEditor } from '@tiptap/react';
import Fuse from 'fuse.js';
import debounce from 'lodash/debounce';
import { useMemo } from 'react';

export const useCustomTiptap = (onUpdate: (text: string) => void) => {
  const users = useUsersContext();
  const wines = useWineContext();
  const customers = useCustomerContext();

  // The "@" menu autocompletes across all three lists: wine names, customer names,
  // and app users (by identifier). Deduped so an overlap doesn't show twice.
  const suggestionList = useMemo(() => {
    const userIdentifiers = users ? users.map(x => x.userIdentifier) : [];
    return Array.from(new Set([...wines, ...customers, ...userIdentifiers].filter(Boolean)));
  }, [wines, customers, users]);

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
      // StarterKit brings Document/Paragraph/Text plus the formatting marks &
      // nodes the toolbar exposes (bold, italic, strike, headings, lists,
      // blockquote, code). Underline is dropped — it has no Markdown form and
      // we persist notes as Markdown.
      StarterKit.configure({ underline: false }),
      // Bidirectional Markdown: lets us load note content with
      // `setContent(md, { contentType: 'markdown' })` and read it back via
      // `editor.getMarkdown()`. Keeps embeddings/LLM context clean (no HTML).
      Markdown,
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: suggestionConfig,
      }),
      Placeholder.configure({
        placeholder: 'Dear diary...',
      }),
    ],
    [suggestionConfig]
  );

  const editor = useEditor({
    extensions,
    onUpdate: ({ editor }) => onUpdate(editor.getMarkdown()),
  });

  return { editor };
};

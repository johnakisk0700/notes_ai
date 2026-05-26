import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { NotebookChart } from './NotebookChart';
import { Mermaid } from './Mermaid';

// Notebook-expressive tags Lexi may emit in raw HTML: highlighter (<mark>),
// keyboard keys (<kbd>), and sub/superscript. The GitHub default schema strips
// these, so allow them explicitly (kept narrow — no new attributes).
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'mark', 'kbd', 'sub', 'sup'],
};

// True when a <pre>'s child is a fenced code block of the given language.
const isFencedAs = (node: unknown, lang: string): boolean => {
  const child = (node as { children?: { tagName?: string; properties?: { className?: unknown } }[] })?.children?.[0];
  const className = child?.properties?.className;
  return child?.tagName === 'code' && Array.isArray(className) && className.includes(`language-${lang}`);
};

const components: Components = {
  // Chart/diagram fences are their own block — drop the <pre> chrome so they
  // don't render inside a code box. Ordinary fences keep the styled <pre>.
  pre({ node, children }) {
    if (isFencedAs(node, 'chart') || isFencedAs(node, 'mermaid')) return <>{children}</>;
    return <pre>{children}</pre>;
  },
  code({ className, children }) {
    const text = String(children ?? '').replace(/\n$/, '');
    if (className?.includes('language-chart')) return <NotebookChart source={text} />;
    if (className?.includes('language-mermaid')) return <Mermaid chart={text} />;
    // Inline code (no language-*) and ordinary fenced code are styled via
    // `.chat-md code` / `.chat-md pre code`; rehype-highlight adds the .hljs spans.
    return <code className={className}>{children}</code>;
  },
};

export const CustomMarkdown = ({ children }: { children?: string }) => {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      // Order matters & is security-critical: parse raw HTML → SANITIZE it →
      // only then syntax-highlight (so hljs spans aren't stripped). chart/mermaid
      // are left as plain text so their raw source reaches the components above.
      rehypePlugins={[
        rehypeRaw,
        [rehypeSanitize, sanitizeSchema],
        [rehypeHighlight, { ignoreMissing: true, plainText: ['chart', 'mermaid'] }],
      ]}
      components={components}
    >
      {children}
    </Markdown>
  );
};

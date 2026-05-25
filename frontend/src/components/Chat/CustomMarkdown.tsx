import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

export const CustomMarkdown = ({ children }) => {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        pre: ({ children }) => <pre className="bg-primary/13 p-2 rounded overflow-x-auto">{children}</pre>,
        code: ({ children }) => <code className="bg-primary/13 p-1.5 inline-block my-1 rounded">{children}</code>,
        hr: ({ children }) => <hr className="my-5">{children}</hr>,
      }}
    >
      {children}
    </Markdown>
  );
};

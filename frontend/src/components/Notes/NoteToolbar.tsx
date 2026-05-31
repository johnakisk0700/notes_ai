import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import { useEditorState, type Editor } from '@tiptap/react';
import { Bold, Code, Heading1, Heading2, Italic, List, ListOrdered, Quote, Strikethrough } from 'lucide-react';
import type { ReactNode } from 'react';

interface ToolbarToggleProps {
  pressed: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: string;
  children: ReactNode;
}

const ToolbarToggle = ({ pressed, disabled, onToggle, label, children }: ToolbarToggleProps) => (
  <Toggle
    size="sm"
    pressed={pressed}
    disabled={disabled}
    // Keep the editor's selection — without this the button steals focus and the
    // mark/node would apply to nothing.
    onMouseDown={e => e.preventDefault()}
    onPressedChange={onToggle}
    title={label}
    aria-label={label}
    // Sits on the bare paper (no toolbar box), so style it as a graphite tool: faint ink wash on
    // hover, and an *inked* fill when the format is on — the page's one accent, not shadcn grey.
    className="size-8 rounded-md text-foreground/60 hover:bg-foreground/5 hover:text-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:hover:bg-primary/15 data-[state=on]:hover:text-primary"
  >
    {children}
  </Toggle>
);

const Divider = () => <Separator orientation="vertical" className="mx-0.5 h-5" />;

interface NoteToolbarProps {
  editor: Editor;
  disabled?: boolean;
  className?: string;
}

/**
 * Formatting controls for the note editor. Active state is read through
 * `useEditorState` because Tiptap v3's `useEditor` no longer re-renders on
 * every transaction — without this the toggles wouldn't reflect the cursor.
 */
export const NoteToolbar = ({ editor, disabled, className }: NoteToolbarProps) => {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      strike: editor.isActive('strike'),
      code: editor.isActive('code'),
      h1: editor.isActive('heading', { level: 1 }),
      h2: editor.isActive('heading', { level: 2 }),
      bullet: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
      quote: editor.isActive('blockquote'),
    }),
  });

  return (
    <div className={cn('flex flex-wrap items-center gap-0.5', className)}>
      <ToolbarToggle
        pressed={active.bold}
        disabled={disabled}
        onToggle={() => editor.chain().focus().toggleBold().run()}
        label="Bold (Ctrl+B)"
      >
        <Bold />
      </ToolbarToggle>
      <ToolbarToggle
        pressed={active.italic}
        disabled={disabled}
        onToggle={() => editor.chain().focus().toggleItalic().run()}
        label="Italic (Ctrl+I)"
      >
        <Italic />
      </ToolbarToggle>
      <ToolbarToggle
        pressed={active.strike}
        disabled={disabled}
        onToggle={() => editor.chain().focus().toggleStrike().run()}
        label="Strikethrough"
      >
        <Strikethrough />
      </ToolbarToggle>
      <ToolbarToggle
        pressed={active.code}
        disabled={disabled}
        onToggle={() => editor.chain().focus().toggleCode().run()}
        label="Inline code"
      >
        <Code />
      </ToolbarToggle>

      <Divider />

      <ToolbarToggle
        pressed={active.h1}
        disabled={disabled}
        onToggle={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        label="Heading 1"
      >
        <Heading1 />
      </ToolbarToggle>
      <ToolbarToggle
        pressed={active.h2}
        disabled={disabled}
        onToggle={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="Heading 2"
      >
        <Heading2 />
      </ToolbarToggle>

      <Divider />

      <ToolbarToggle
        pressed={active.bullet}
        disabled={disabled}
        onToggle={() => editor.chain().focus().toggleBulletList().run()}
        label="Bullet list"
      >
        <List />
      </ToolbarToggle>
      <ToolbarToggle
        pressed={active.ordered}
        disabled={disabled}
        onToggle={() => editor.chain().focus().toggleOrderedList().run()}
        label="Numbered list"
      >
        <ListOrdered />
      </ToolbarToggle>
      <ToolbarToggle
        pressed={active.quote}
        disabled={disabled}
        onToggle={() => editor.chain().focus().toggleBlockquote().run()}
        label="Quote"
      >
        <Quote />
      </ToolbarToggle>
    </div>
  );
};

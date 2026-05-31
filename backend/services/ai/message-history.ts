import type { UIMessage } from "ai";

type TextPart = Extract<UIMessage["parts"][number], { type: "text" }>;

interface ToolPart {
  type?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  transaction?: { status?: string };
}

const SUMMARY_CHARS = 500;

function textFromParts(parts: UIMessage["parts"]): string {
  return parts
    .filter((p): p is TextPart => p.type === "text" && typeof p.text === "string")
    .map(p => p.text)
    .join("");
}

function clip(value: unknown, max = SUMMARY_CHARS): string {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + "..." : clean;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function quoted(value: unknown): string {
  const text = clip(value, 160);
  return text ? `"${text}"` : "(untitled)";
}

function decisionText(status: unknown): string {
  if (status === "applied") return "The user accepted/applied this edit.";
  if (status === "discarded") return "The user declined/discarded this edit.";
  return "The user has not applied or discarded this edit in the UI.";
}

function draftSummary(output: Record<string, unknown>): string {
  return [
    `A draft note was opened in the editor: ${quoted(output.title)}.`,
    clip(output.content) ? `Draft content: ${clip(output.content)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function noteToolSummary(part: ToolPart): string | null {
  const output = obj(part.output);
  const transaction = obj(part.transaction);

  // create_note "draft" mode (mode:"draft"), and the legacy standalone draft_note tool.
  if (
    (part.type === "tool-create_note" && output.mode === "draft") ||
    (part.type === "tool-draft_note" && output.openedInEditor === true)
  ) {
    return draftSummary(output);
  }

  if (part.type === "tool-create_note") {
    if (output.saved === true) {
      const savedText =
        transaction.status === "retry_saved"
          ? "A failed note-create attempt was retried manually and saved"
          : "A note was created and saved";
      return [
        `${savedText}: ${quoted(output.title)}.`,
        output.noteId ? `Note id: ${String(output.noteId)}.` : "",
        clip(output.content) ? `Content: ${clip(output.content)}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
    if (transaction.status === "retry_saved") {
      return "A failed note-create attempt was retried manually and then saved successfully.";
    }
    if (output.saved === false) {
      return `A note-create attempt failed${output.error ? `: ${clip(output.error)}` : "."}`;
    }
  }

  // Edit tools: propose_edit (before→after card) + save_edit (immediate write), and the legacy
  // unified edit_note / propose_note_edit. Keyed off the OUTPUT shape (not the tool name or `mode`)
  // so all variants summarize the same: a write (saved) vs a proposal (before→after) vs not-found.
  if (
    part.type === "tool-propose_edit" ||
    part.type === "tool-save_edit" ||
    part.type === "tool-edit_note" ||
    part.type === "tool-propose_note_edit"
  ) {
    if (output.found === false) {
      return `A note edit was attempted, but the note was not found${output.noteId ? ` (${String(output.noteId)})` : ""}.`;
    }
    // Committed immediately (save_edit, legacy edit_note "save", or a manual retry).
    if (output.saved === true || transaction.status === "retry_saved") {
      return [
        `A note was edited and saved: ${quoted(output.title)}${output.noteId ? ` (${String(output.noteId)})` : ""}.`,
        clip(output.content) ? `New content: ${clip(output.content)}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
    if (output.saved === false) {
      return `A note-edit save attempt failed${output.error ? `: ${clip(output.error)}` : "."}`;
    }
    // Proposed a before→after for the user to apply/discard.
    if (output.found === true && (output.before !== undefined || output.after !== undefined)) {
      return [
        `A note edit was proposed for ${quoted(output.title)}${output.noteId ? ` (${String(output.noteId)})` : ""}.`,
        clip(output.before) ? `Before: ${clip(output.before)}.` : "",
        clip(output.after) ? `After: ${clip(output.after)}.` : "",
        decisionText(transaction.status),
      ]
        .filter(Boolean)
        .join(" ");
    }
    // A duplicate that the one-edit-per-turn guard skipped (skipped:true) — no durable summary.
    return null;
  }

  return null;
}

function assistantMemoryText(parts: UIMessage["parts"]): string {
  const answer = textFromParts(parts).trim();
  const summaries = parts
    .filter(p => typeof p.type === "string" && p.type.startsWith("tool-"))
    .map(p => noteToolSummary(p as ToolPart))
    .filter((summary): summary is string => Boolean(summary));

  return [answer, ...summaries].filter(Boolean).join("\n\n");
}

// Reduce the conversation we feed the model to a clean, always-valid form: PRIOR assistant
// turns are projected to their TEXT answer only.
//
// Why: an assistant turn's persisted tool-call / reasoning / step parts are ephemeral working
// state, not conversation. Round-tripping them through Mongo (stored as Mixed) is fragile —
// `providerExecuted: null` and other null provider fields, empty/redacted reasoning, and
// dangling (resultless) tool calls from an interrupted turn all fail the strict `ModelMessage`
// schema. `streamText` then rejects the WHOLE turn with "messages do not match the
// ModelMessage[] schema", which is what wedges a thread after an interrupted answer. Durable
// note-action outcomes are folded into deterministic text summaries, and the persisted parts
// still render in the UI — only the MODEL input is reduced. User turns (incl. image `file`
// parts) are left untouched.
export function historyForModel(messages: UIMessage[]): UIMessage[] {
  return messages
    .map(m => {
      if (m.role !== "assistant") return m;
      const text = assistantMemoryText(m.parts);
      const parts = (text.trim().length ? [{ type: "text" as const, text }] : []) as UIMessage["parts"];
      return { ...m, parts };
    })
    .filter(m => m.role !== "assistant" || m.parts.length > 0);
}

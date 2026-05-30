import type { UIMessage } from "ai";

// Reduce the conversation we feed the model to a clean, always-valid form: PRIOR assistant
// turns are projected to their TEXT answer only.
//
// Why: an assistant turn's persisted tool-call / reasoning / step parts are ephemeral working
// state, not conversation. Round-tripping them through Mongo (stored as Mixed) is fragile —
// `providerExecuted: null` and other null provider fields, empty/redacted reasoning, and
// dangling (resultless) tool calls from an interrupted turn all fail the strict `ModelMessage`
// schema. `streamText` then rejects the WHOLE turn with "messages do not match the
// ModelMessage[] schema", which is what wedges a thread after an interrupted answer. Each turn
// re-searches anyway, and the persisted parts still render in the UI — only the MODEL input is
// reduced. User turns (incl. image `file` parts) are left untouched.
export function historyForModel(messages: UIMessage[]): UIMessage[] {
  return messages
    .map(m => {
      if (m.role !== "assistant") return m;
      const text = m.parts.filter(
        (p): p is Extract<UIMessage["parts"][number], { type: "text" }> =>
          p.type === "text" && typeof p.text === "string" && p.text.trim().length > 0
      );
      return { ...m, parts: text };
    })
    .filter(m => m.role !== "assistant" || m.parts.length > 0);
}

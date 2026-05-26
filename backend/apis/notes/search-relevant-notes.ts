import { gptSystemUserQueryWithTools, openai } from "clients/openai_client";
import { qdrantClient } from "clients/qdrant_client";
import type { Request, Response } from "express";
import { generateNoteSearchSystemPrompt, generateNoteSearchToolSystemPrompt } from "../../utils/gptPromptGenerator.js";
import type { ChatCompletionTool } from "openai/resources/index.mjs";
import { handleAiStream } from "services/ai/ai_chat";
import type { Message } from "model/mongo-db/Message";
import { appendMessage, createThread, deriveThreadTitle } from "services/chat-threads";
import { logger } from "utils/logger";

interface SearchRelevantNotesRequest {
  query: string;
  selectedUsers: string[];
  previousQueries: {
    role: "user" | "system" | "assistant";
    content: string;
  }[];
  now: Date;
  // Existing thread to append this turn to. Omitted for the first message of a
  // new chat, in which case the server creates one and streams back its id.
  threadId?: string;
}
const PAGE_SIZE = 100;

async function searchRelevantNotes(req: Request, res: Response) {
  const { query: initialQuery, selectedUsers, previousQueries, now, threadId }: SearchRelevantNotesRequest = req.body;
  const userId = req.user.id;
  const userIds = selectedUsers ? [userId, ...selectedUsers] : [userId];

  // Resolve (or create) the thread this turn belongs to and persist the user's
  // message. Best-effort: a Mongo hiccup must never block the streamed answer.
  let activeThreadId = typeof threadId === "string" && threadId ? threadId : undefined;
  try {
    if (!activeThreadId) {
      const created = await createThread(userId, deriveThreadTitle(initialQuery));
      activeThreadId = created.id;
      // Hand the new id to the client so it can route to /thread/:id.
      res.write(`event: thread\ndata: ${activeThreadId}\n\n`);
    }
    if (activeThreadId) {
      await appendMessage(activeThreadId, userId, {
        role: "user",
        content: initialQuery,
      });
    }
  } catch (err) {
    logger.error("Thread persistence (user message) failed; continuing:", err);
  }

  // const qdrantQuery: QdrantQueryBody = await generateQdrantQueryUsingTools(
  //   now,
  //   initialQuery,
  //   previousQueries,
  //   res,
  //   userIds
  // );

  const qdrantQuery: QdrantQueryBody = await generateQdrantQueryClassic(initialQuery, userIds, res);

  const relevantNotes = await qdrantClient.query("notes", qdrantQuery);
  const filteredNotes = relevantNotes.points
    .slice(0, PAGE_SIZE) // Take only PAGE_SIZE records
    .map(({ payload }) => `<${payload?.concatenated}>`);

  console.log("notes pou vrethikan: ", filteredNotes);

  // const relevantClients = await qdrantClient.query("polites", {
  //   query: queryEmbedding,
  //   with_payload: true,
  //   with_vector: false,
  //   limit: 120,
  // });
  // const parsedClients = relevantClients.points.map(
  //   ({ payload }) =>
  //     `[${payload?.concatenated}, remainder: ${payload?.remainder}, city: ${payload?.city}, AFM: ${payload?.AFM}, emails: [${payload?.email} & ${payload?.email_2}], phone: ${payload?.phone_1}, location: ${payload?.street_name} ${payload?.streen_number}]`
  // );

  // console.log("clients?:", parsedClients);

  console.time("GPT time");
  const hasNotes = filteredNotes.length > 0;

  const gpt4oQuery = {
    systemQuery: generateNoteSearchSystemPrompt(),
    userQuery: hasNotes
      ? `Here are my notes in <[user: (user_name)] [created at: (creation_date)] [Reminder: (reminder_date)] [Note: (note_content)]> format: ${filteredNotes.join(
          ""
        )} My question is: ${initialQuery}`
          .replace(/\s*\r?\n\s*/g, " ")
          .trim()
      : `I don't have any notes right now. My question is: ${initialQuery}`,
  };

  const finalMessages = [
    ...previousQueries,
    { role: "system", content: gpt4oQuery.systemQuery },
    { role: "user", content: gpt4oQuery.userQuery },
  ] as Message[];

  await handleAiStream(
    req,
    res,
    { model: "gpt-5-mini", messages: finalMessages },
    {
      // Persist the assistant's answer once the stream completes (best-effort).
      onDone: (answer: string) => {
        if (!activeThreadId || !answer) return;
        appendMessage(activeThreadId, userId, {
          role: "assistant",
          content: answer,
        }).catch(err => logger.error("Thread persistence (assistant message) failed:", err));
      },
    }
  );
  console.timeEnd("GPT time");
}

const tools: Array<ChatCompletionTool> = [
  {
    type: "function",
    function: {
      name: "date-range-search",
      description: "Search notes based on a date range",
      parameters: {
        type: "object",
        properties: {
          dateStart: {
            type: "string",
            description: "The start date time",
          },
          dateEnd: {
            type: "string",
            description: "The end date time",
          },
        },
        required: ["dateStart", "dateEnd"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query-search",
      description: "Perform a search query using embeddings on all notes.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to perform.",
          },
        },
        required: ["query"],
      },
    },
  },
];
type QdrantQueryBody = Parameters<typeof qdrantClient.query>[1];

async function generateQdrantQueryClassic(
  initialQuery: string,
  userIds: any[],
  res: Response<any, Record<string, any>>
): Promise<QdrantQueryBody> {
  res.write(`manual: Consulting advanced AI.\n\n`);
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: initialQuery,
  });

  const queryEmbedding = response.data[0].embedding;
  return {
    query: queryEmbedding,
    with_payload: true,
    with_vector: false,
    limit: PAGE_SIZE,
    filter: {
      must: [
        {
          key: "user_id",
          match: { any: userIds },
        },
      ],
    },
  } as QdrantQueryBody;
}

async function generateQdrantQueryUsingTools(
  now: Date,
  initialQuery: string,
  previousQueries: { role: "user" | "system" | "assistant"; content: string }[],
  res: Response<any, Record<string, any>>,
  userIds: any[]
) {
  const gptQueryToolCall = {
    systemQuery: generateNoteSearchToolSystemPrompt(now),
    userQuery: `My search query is: ${initialQuery} ${getLastUserMessage(previousQueries)}`
      .replace(/\s*\r?\n\s*/g, " ")
      .trim(),
  };

  res.write(`manual: Consulting advanced AI.\n\n`);
  const gptQueryToolCallAnswer = await gptSystemUserQueryWithTools("gpt-4o", gptQueryToolCall, tools);
  res.write(`manual: Searching through your notes.\n\n`);
  const qdrantQuery: QdrantQueryBody = {
    with_payload: true,
    with_vector: false,
    filter: {
      must: [
        {
          key: "user_id",
          match: { any: userIds },
        },
      ],
    },
  };
  const pageNumber = 0;
  for (const tool_call of gptQueryToolCallAnswer.choices[0].message.tool_calls || []) {
    if (tool_call.function.name === "query-search") {
      const query = JSON.parse(tool_call.function.arguments).query as string;

      const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: query,
      });

      const queryEmbedding = response.data[0].embedding;
      qdrantQuery.query = queryEmbedding;
    }

    if (tool_call.function.name === "date-range-search") {
      const dates = JSON.parse(tool_call.function.arguments) as {
        dateStart: string;
        dateEnd: string;
      };

      (qdrantQuery.filter!.must as any[]).push({
        key: "created_at",
        range: {
          gte: dates.dateStart,
          lte: dates.dateEnd,
        },
      });
    }
  }
  // logger.info(JSON.stringify(gptQueryToolCall));
  // logger.info(JSON.stringify(gptQueryToolCallAnswer));
  // if gpt did not include page, initialize it
  qdrantQuery.offset = pageNumber * PAGE_SIZE;
  qdrantQuery.limit = (pageNumber + 1) * PAGE_SIZE + 1;
  return qdrantQuery;
}

function getLastUserMessage(
  queries: {
    role: "user" | "system" | "assistant";
    content: string;
  }[]
): string {
  for (let i = queries.length - 1; i >= 0; i--) {
    if (queries[i].role === "user") {
      return (
        " my last query prompt is " +
        queries[i].content +
        " IF you infer that we need the next page request the paging tool!"
      );
    }
  }

  return "";
}

export default searchRelevantNotes;

import OpenAI from "openai";
import type { ChatCompletionTool, ChatModel } from "openai/resources/index.mjs";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Make sure to set this in your environment variables
});

export async function gptSimpleQuery(model, prompt) {
  return openai.chat.completions.create({
    model: model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });
}

export interface GPTMessage {
  role: "system" | "assistant" | "user";
  content: string;
}
export async function gptSystemUserQuery(
  model,
  { systemQuery, userQuery }: { systemQuery: string; userQuery: string },
  previousMessages: GPTMessage[] | undefined = undefined
) {
  const messages: GPTMessage[] = [
    {
      role: "system",
      content: systemQuery,
    },
  ];

  if (previousMessages) {
    previousMessages.forEach(previousMessage => {
      messages.push({
        role: previousMessage.role || "user",
        content: previousMessage.content,
      });
    });
  }

  messages.push({
    role: "user",
    content: userQuery,
  });

  console.log(messages);
  return openai.chat.completions.create({
    model: model,
    messages: messages,
  });
}

export async function gptSystemUserQueryWithTools(
  model: ChatModel,
  { systemQuery, userQuery }: { systemQuery: string; userQuery: string },
  tools: Array<ChatCompletionTool>
) {
  const messages: GPTMessage[] = [
    {
      role: "system",
      content: systemQuery,
    },
  ];

  messages.push({
    role: "user",
    content: userQuery,
  });

  return openai.chat.completions.create({
    model: model,
    messages: messages,
    tool_choice: "required",
    tools: tools,
  });
}

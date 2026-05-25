import { gptSystemUserQuery } from "clients/openai_client";
import { sommelierPrompt } from "utils/gptPrompts";

export async function getWineAdvice(req, res) {
  const { query, previousQueries } = req.body;
  const gpt4oQuery = {
    systemQuery:
      "Βοηθας τους χρηστες να συνδιασουν κρασια με κρεατα και ψαρια!", //sommelierPrompt,
    userQuery: query,
  };
  const gptAnswer = await gptSystemUserQuery(
    "gpt-4.1",
    gpt4oQuery,
    previousQueries
  );

  res.json({ gptAnswer: gptAnswer.choices[0].message.content });
}

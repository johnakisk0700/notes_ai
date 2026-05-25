import { getAiChatResponse } from "service/ai_malakies/ai_chat";

export async function getNoteTitle(req, res) {
  const { content } = req.body;

  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "Note content is required" });
  }

  const systemPrompt = `Είσαι ένας μυστικός πράκτορας που ταμπελώνει τις σημειώσεις των χρηστών.
  Χρησιμοποίησε την παρακάτω σημείωση για να δημιουργήσεις έναν κατάλληλο τίτλο. 
  Ο τίτλος πρέπει να είναι σύντομος, περιεκτικός και να αντικατοπτρίζει το περιεχόμενο της σημείωσης.
  Βάζεις emoji αν ταιριάζει, αλλά δεν είναι υποχρεωτικό.`;

  const messages = [
    {
      role: "user" as const,
      content: `Σε παρακαλώ ταμπέλωσε μου αυτό εδώ:\n\n${content}`,
    },
  ];

  const aiResponse = await getAiChatResponse({
    model: "gpt-4.1-nano",
    messages,
    systemPrompt,
    maxTokens: 120,
  });
  req.addCost({
    model: "gpt-4.1-nano",
    inputCost: aiResponse.inputCost,
    outputCost: aiResponse.outputCost,
    totalCost: aiResponse.totalCost,
  });

  res.status(200).json({
    title: aiResponse.content.trim(),
    cost: {
      input: aiResponse.inputCost,
      output: aiResponse.outputCost,
      total: aiResponse.totalCost,
    },
  });
}

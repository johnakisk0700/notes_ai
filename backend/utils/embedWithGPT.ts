import { openai } from "clients/openai_client";

export async function embedWithGPT(textsToEmbed: string[]) {
  const embeddings: number[][] = [];

  // Embed arrays using text-embedding-ada-002
  for (let i = 0; i < textsToEmbed.length; i += 100) {
    const batch = textsToEmbed.slice(i, i + 100);

    try {
      console.log(`Processing batch ${i / 100 + 1}...`);
      const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: batch,
      });

      // Extract embeddings
      const batchEmbeddings = response.data.map((entry) => entry.embedding);
      embeddings.push(...batchEmbeddings);
    } catch (error) {
      console.error("Error fetching embeddings:", error);
    }
  }

  return embeddings;
}

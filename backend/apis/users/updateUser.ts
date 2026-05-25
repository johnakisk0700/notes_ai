import { PointStruct } from "@qdrant/qdrant-js/grpc";
import { openai } from "clients/openai_client";
import { qdrantClient } from "clients/qdrant_client";

export const updateUser = async (req, res, next) => {
  const { customers, userId } = req.body;

  for (const customer of customers) {
    // Search for the customer by name and title
    const searchResult = await qdrantClient.scroll("customers", {
      filter: {
        must: [
          { key: "name", match: { value: customer.name } },
          { key: "title", match: { value: customer.title } },
        ],
      },
      limit: 1,
    });

    if (searchResult.points.length === 0) {
      console.warn(
        `Customer ${customer.name} with title ${customer.title} not found.`
      );
      continue;
    }

    console.log(searchResult.points[0].payload);
    const pointId = searchResult.points[0].id;

    // Concatenate name, title, and user_id to form the new text
    const combinedText = `${customer.name} ${customer.title} user/χρήστης: ${userId}`;

    // Generate a new embedding for the combined text
    const newEmbedding = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: combinedText,
    });

    // Update the vector of the point with the new embedding
    await qdrantClient.updateVectors("customers", {
      points: [
        {
          id: pointId,
          vector: newEmbedding,
        },
      ],
    });

    console.log(
      `Associated customer ${customer.name} with user ${userId} and updated embedding.`
    );
  }
};

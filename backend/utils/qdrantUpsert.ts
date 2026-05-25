import { qdrantClient } from "clients/qdrant_client";

export async function qdrantBatchUpsert(collectionName, points) {
  const batchSize = 75; // Define your batch size
  const totalPoints = points.length;
  const numBatches = Math.ceil(totalPoints / batchSize); // Calculate the number of batches

  console.log(
    `Total points: ${totalPoints}, Batch size: ${batchSize}, Number of batches: ${numBatches}`
  );

  for (let i = 0; i < numBatches; i++) {
    const batchStart = i * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, totalPoints); // Ensure end doesn't exceed totalPoints
    const pointBatch = points.slice(batchStart, batchEnd);

    console.log(
      `Processing batch ${i + 1} of ${numBatches}, points ${batchStart} to ${batchEnd - 1}`
    );

    try {
      const operationInfo = await qdrantClient.upsert(collectionName, {
        wait: true,
        points: pointBatch,
      });
      console.debug(`Batch ${i + 1} upserted successfully:`, operationInfo);
    } catch (error) {
      console.error(`Error upserting batch ${i + 1}:`, error);
      throw error;
    }
  }
}

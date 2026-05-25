import { NextFunction, Request, Response } from "express";
import Decimal from "decimal.js";
import { CostEntry, costTracker } from "utils/costTracker";
import { randomUUID } from "crypto";
import { randomUUIDv7 } from "bun";
import { sql } from "drizzle-orm";
import {
  InsertKataskopos,
  kataskoposTable,
} from "@shared/db/schema/kataskopos";
import { tefteriTable, Tefteri } from "@shared/db/schema/tefteri";
import { drizzlePg } from "clients/drizzle_postgres_client";

export const costMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = `req-${randomUUID()}`;

  costTracker.run({ requestId }, () => {
    // Attach helpers to the request object for convenience
    req.requestId = costTracker.getRequestId()!;
    req.addCost = costTracker.addCost;
    req.getTotalCost = costTracker.getTotalCost;

    res.on("finish", async () => {
      const totalCost = req.getTotalCost();
      const kataskoposEntries: InsertKataskopos[] = costTracker
        .getCostEntries()
        .map((cost) => ({
          userId: req.user.id,
          model: cost.model,
          inputCost: cost.inputCost.toString(),
          outputCost: cost.outputCost.toString(),
          totalCost: cost.totalCost.toString(),
        }));
      if (kataskoposEntries.length > 0) {
        try {
          await Promise.all([
            drizzlePg.insert(kataskoposTable).values(kataskoposEntries),
            drizzlePg
              .insert(tefteriTable)
              .values({
                userId: req.user.id,
                totalCost: totalCost.toString(),
                queryCount: 1,
              })
              .onConflictDoUpdate({
                target: tefteriTable.userId,
                set: {
                  totalCost: sql`${tefteriTable.totalCost} + ${totalCost.toString()}`,
                  queryCount: sql`${tefteriTable.queryCount} + 1`,
                  updated_at: new Date(),
                },
              }),
          ]);
        } catch (error) {
          console.error("Failed to save cost data:", error);
        }
      }
      if (totalCost.toNumber() > 0) {
        console.log(
          `💰 ${req.user?.user_metadata.first_name} ${req.user?.user_metadata.last_name}: $${totalCost.toFixed(8)}`
        );
      }
    });

    next();
  });
};

import "dotenv/config";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "@shared/db/schema";

// Register the full schema barrel so the relational query API
// (`drizzlePg.query.<table>.findMany`) and all defined `relations()` work for
// every table that defines them. The barrel exports tables, enums and
// relations; drizzle reads what it needs and ignores the rest.
export const drizzlePg = drizzle({
  schema,
  // Connection target comes solely from POSTGRES_URI (compose sets the in-container
  // host; shared/.env sets localhost:5433 for host-run dev). Don't hardcode host/
  // port/credentials here — they'd silently conflict with the URL.
  connection: {
    url: process.env.POSTGRES_URI,

    // Connection pool settings
    max: 5, // Maximum connections in pool
    idleTimeout: 30, // Close idle connections after 30s
    maxLifetime: 0, // Connection lifetime in seconds (0 = forever)
    connectionTimeout: 30, // Timeout when establishing new connections
  },
});

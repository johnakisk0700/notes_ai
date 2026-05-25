import "dotenv/config";
import { drizzle } from "drizzle-orm/bun-sql";
import * as notesSchema from "@shared/db/schema/notes";
import * as remindersSchema from "@shared/db/schema/reminders";

const schema = { ...notesSchema, ...remindersSchema };

// You can specify any property from the bun sql connection options
export const drizzlePg = drizzle({
  schema,
  connection: {
    // Required
    url: process.env.POSTGRES_URI,

    // Optional configuration
    hostname: "localhost",
    port: 5433,
    database: "postgres",
    username: "postgres",
    password: "example",

    // Connection pool settings
    max: 5, // Maximum connections in pool
    idleTimeout: 30, // Close idle connections after 30s
    maxLifetime: 0, // Connection lifetime in seconds (0 = forever)
    connectionTimeout: 30, // Timeout when establishing new connections

    // SSL/TLS options
    //   tls: true,
    // tls: {
    //   rejectUnauthorized: true,
    //   requestCert: true,
    //   ca: "path/to/ca.pem",
    //   key: "path/to/key.pem",
    //   cert: "path/to/cert.pem",
    //   checkServerIdentity(hostname, cert) {
    //     ...
    //   },
    // },

    // Callbacks
    onconnect: (client) => {
      // console.log("Connected to database");
    },
    onclose: (client) => {
      // console.log("Connection closed");
    },
  },
});

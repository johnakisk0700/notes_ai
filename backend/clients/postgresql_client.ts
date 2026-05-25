import { SQL } from "bun";
import { Pool, QueryResultRow } from "pg";

export const pool = new Pool({
  database: "postgres",
  user: "postgres",
  password: "example",
  host: "localhost",
  port: 5433,
  // Adjust these based on your worker count
  max: 10, // Maximum number of clients in the pool per worker
  min: 2, // Minimum number of clients to keep in pool per worker
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
});

export const query = async <T extends QueryResultRow>(
  text,
  params: any[] = []
) => {
  try {
    const start = Date.now();
    const result = await pool.query<T>(text, params);

    // // Optional: Add query logging for debugging
    // if (process.env.MODE === "dev") {
    //   const duration = Date.now() - start;
    //   console.log("Executed Query:", text, "\nQuery Info", {
    //     duration,
    //     rows: result.rowCount,
    //   });
    // }

    return result;
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
};

// Bun Postgres Client Configuration
export const bunPostgres = new SQL({
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
});

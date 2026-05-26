// Applies the SQL migrations in ./drizzle, then exits.
//
// Used by both:
//   - the compose `migrate` one-shot service (POSTGRES_URI from the container env), and
//   - `bun run db:migrate` on the host (Bun auto-loads shared/.env → POSTGRES_URI).
//
// Uses Drizzle's programmatic migrator instead of `drizzle-kit migrate` on purpose:
// it needs no esbuild bundling step, so it runs cleanly inside the Bun container
// (drizzle-kit chokes bundling `dotenv/config` there). It shares the same default
// `drizzle.__drizzle_migrations` journal table, so it's interchangeable with any
// migrations previously applied via drizzle-kit.
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

const url = process.env.POSTGRES_URI;
if (!url) {
  console.error("POSTGRES_URI is not set — cannot run migrations.");
  process.exit(1);
}

const db = drizzle({
  connection: {
    url,
    max: 1,
    connectionTimeout: 30,
  },
});

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");
process.exit(0);

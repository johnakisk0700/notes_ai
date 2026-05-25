import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bunPostgres } from "../clients/postgresql_client.js"; // Use your custom client
import { sql as sqlIdentifier } from "bun"; // Import the sql helper for dynamic identifiers

const MIGRATIONS_TABLE = "schema_migrations";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, "./postgresql");

async function ensureMigrationsTableExists() {
  await bunPostgres`
    CREATE TABLE IF NOT EXISTS ${sqlIdentifier(MIGRATIONS_TABLE)} (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `;
  console.log(`Migrations table '${MIGRATIONS_TABLE}' ensured.`);
}

async function getAppliedMigrationVersions(): Promise<Set<string>> {
  const result = await bunPostgres`SELECT version FROM ${sqlIdentifier(
    MIGRATIONS_TABLE
  )}`;
  return new Set(result.map((row: any) => row.version));
}

export async function runMigrations() {
  console.log("Starting database migrations...");

  try {
    // Add this line to drop tables before migrations
    // Be cautious with this in production environments
    // await dropAllPublicTables();

    await ensureMigrationsTableExists();
    const appliedVersions = await getAppliedMigrationVersions();

    let migrationFiles;
    try {
      migrationFiles = (await fs.readdir(MIGRATIONS_DIR))
        .filter((file) => file.endsWith(".sql"))
        .sort();
    } catch (err: any) {
      if (err.code === "ENOENT") {
        console.log(
          `Migrations directory '${MIGRATIONS_DIR}' not found. No migrations to run.`
        );
        return;
      }
      throw err; // Re-throw other errors
    }

    if (migrationFiles.length === 0) {
      console.log("No migration files found.");
      return;
    }

    for (const file of migrationFiles) {
      const version = file; // Use filename as the version
      if (appliedVersions.has(version)) {
        continue;
      }

      console.log(`Applying migration ${version}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sqlContent = await fs.readFile(filePath, "utf-8");

      // Run each migration file in a transaction
      await bunPostgres.begin(async (tx) => {
        await tx.unsafe(sqlContent); // Execute the raw SQL from the file
        await tx`INSERT INTO ${sqlIdentifier(
          MIGRATIONS_TABLE
        )} (version) VALUES (${version})`;
      });
      console.log(`Migration ${version} applied successfully.`);
    }
    console.log("Database migrations completed successfully.");
  } catch (error: any) {
    console.error("Failed to run database migrations:", error.message);
    process.exit(1); // Exit if migrations fail
  }
}

async function dropAllPublicTables() {
  console.log("Dropping all tables and ENUM types in public schema...");

  // Drop tables first
  const tables = await bunPostgres`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public';
  `;

  if (tables.length > 0) {
    const dropTableStatements = tables.map(
      (table: any) =>
        `DROP TABLE IF EXISTS public."${table.tablename}" CASCADE;`
    );
    await bunPostgres.unsafe(dropTableStatements.join("\n"));
    console.log("All tables in public schema dropped.");
  } else {
    console.log("No tables found in public schema to drop.");
  }

  // Then drop ENUM types
  // This will help ensure types like 'user_role' are removed before migrations try to recreate them.
  const enumTypes = await bunPostgres`
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typtype = 'e'; -- 'e' for ENUM types
  `;

  if (enumTypes.length > 0) {
    const dropTypeStatements = enumTypes.map(
      (type: any) => `DROP TYPE IF EXISTS public."${type.typname}" CASCADE;`
    );
    await bunPostgres.unsafe(dropTypeStatements.join("\n"));
    console.log("All ENUM types in public schema dropped.");
  } else {
    console.log("No ENUM types found in public schema to drop.");
  }
}

// Actually run the migrations when this module is imported
(async () => {
  try {
    await dropAllPublicTables(); // Optional: Drop all public tables before running migrations
    await runMigrations();
  } catch (error) {
    console.error("Error running migrations:", error);
    process.exit(1); // Exit if migrations fail
  }
})();

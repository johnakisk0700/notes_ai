// Barrel for the Drizzle schema.
// Import tables/types from here, e.g. `import { notesTable, Note } from "@shared/db/schema"`.
export * from "./customers";
export * from "./ecbConversionRates";
export * from "./kataskopos";
export * from "./notes";
export * from "./profile";
export * from "./tefteri";
export * from "./wines";

// NB: AI chat threads/messages are NOT in Postgres — they live in MongoDB
// (backend/model/mongo-db/UserThreads). See docs/data-stores.md.

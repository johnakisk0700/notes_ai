// Public surface of the `shared` workspace, consumed by both backend and
// frontend through the `@shared` path alias. Import from this barrel
// (`import { Note, GetNoteDTO } from "@shared"`) or deep
// (`import { Note } from "@shared/db/schema/notes"`) — both resolve to the
// same source files, no build step.

export * from "./db/schema";
export * from "./dto/GetNoteDTO";
export * from "./interfaces/QueryParameters";
export * from "./interfaces/OpenAI";
export * from "./interfaces/UserSettings";

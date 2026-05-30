import type { Note } from "@shared/db/schema/notes";
import type { Reminder } from "@shared/db/schema/reminders";
import type { PaginationResponse } from "@shared/interfaces/QueryParameters";

export type FullNote = Note & { reminder: Reminder };
// The /api/get-notes response: a paginated envelope of notes. Equivalent to the wire
// shape ({ data: FullNote[]; pagination: { page, limit, totalCount, ... } }).
export type GetNoteDTO = PaginationResponse<FullNote>;

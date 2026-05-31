import type { Note } from "@shared/db/schema/notes";
import type { PaginationResponse } from "@shared/interfaces/QueryParameters";

// Kept as an alias so existing consumers don't churn; notes no longer carry a reminder relation.
export type FullNote = Note;
// The /api/get-notes response: a paginated envelope of notes. Equivalent to the wire
// shape ({ data: FullNote[]; pagination: { page, limit, totalCount, ... } }).
export type GetNoteDTO = PaginationResponse<FullNote>;

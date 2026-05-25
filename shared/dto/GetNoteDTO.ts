import type { Note } from "@shared/db/schema/notes";
import type { Reminder } from "@shared/db/schema/reminders";
import type { PaginationResponse } from "@shared/interfaces/QueryParameters";

export type FullNote = Note & { reminder: Reminder };
export type GetNoteDTO = {
  data: FullNote[];
  pagination: PaginationResponse<FullNote>;
};

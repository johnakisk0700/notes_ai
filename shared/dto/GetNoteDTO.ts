import { Note } from "@shared/db/schema/notes";
import { Reminder } from "@shared/db/schema/reminders";
import { PaginationResponse } from "@shared/interfaces/QueryParameters";

export type FullNote = Note & { reminder: Reminder };
export type GetNoteDTO = {
  data: FullNote[];
  pagination: PaginationResponse<FullNote>;
};

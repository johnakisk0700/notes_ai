import type { FullNote } from "@shared/dto/GetNoteDTO";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { AppError } from "middleware/common/AppError";

export async function getAllUsersNotes(req, res) {
  const isAdmin = req.user.isAdmin;
  if (!isAdmin) throw new AppError({ message: "Admins only." });

  const notesQuery = drizzlePg.query.notesTable.findMany({
    orderBy: (notes, { asc, desc }) => [desc(notes.updated_at)],
  });

  const notes = await notesQuery;

  const response: { notes: FullNote[] } = {
    notes,
  };

  res.status(200).json(response);
}

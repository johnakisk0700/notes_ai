import { FullNote } from "@shared/dto/GetNoteDTO";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { AppError } from "middleware/common/AppError";

export async function getAllUsersNotes(req, res) {
  const isAdmin = req.user.isAdmin;
  if (!isAdmin) throw new AppError({ message: "Admins only." });

  const notesQuery = drizzlePg.query.notesTable.findMany({
    with: {
      reminder: true, // This includes the related reminder
    },
    orderBy: (notes, { asc, desc }) => [desc(notes.updated_at)],
  });

  const notesWithReminders = await notesQuery;

  const response: { notes: FullNote[] } = {
    notes: notesWithReminders,
  };

  res.status(200).json(response);
}

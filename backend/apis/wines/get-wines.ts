import { lookupsRepo } from "repositories/lookups";

// Editor "@mention" autocomplete source — the wine name list (shared with the chat's
// lookup_names tool via repositories/lookups).
export async function getWines(req, res) {
  const names = await lookupsRepo.allNames("wines");
  res.status(200).json({ names });
}

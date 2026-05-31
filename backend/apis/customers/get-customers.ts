import { lookupsRepo } from "repositories/lookups";

// Editor "@mention" autocomplete source — the customer name list (shared with the chat's
// lookup_names tool via repositories/lookups).
export async function getCustomers(req, res) {
  const names = await lookupsRepo.allNames("customers");
  res.status(200).json({ names });
}

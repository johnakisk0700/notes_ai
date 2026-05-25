import "dotenv/config";
import { drizzle } from "drizzle-orm/bun-sql";

// sample migrations file

const db = drizzle(process.env.DATABASE_URL!);
async function main() {
  //   await db
  //     .delete(usersTable)
  //     .where(eq(usersTable.email, "vrouts_pouts@gmail.com"));
  //   console.log("User deleted!");
}
main();

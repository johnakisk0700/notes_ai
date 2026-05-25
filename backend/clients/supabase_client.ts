import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { Database } from "./supabase/types.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; // Use your anon or service role key as needed

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase URL or ANON key in environment variables.");
}

const getSupabaseForUser = (accessToken) => {
  return createClient<Database>(
    process.env.SUPABASE_URL || "",
    process.env.SUPABASE_ANON_KEY || "",
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  );
};

export default getSupabaseForUser;

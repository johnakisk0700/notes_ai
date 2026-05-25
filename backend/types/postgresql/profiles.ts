export type UserRole = "user" | "admin";

export interface Profile {
  id: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
}

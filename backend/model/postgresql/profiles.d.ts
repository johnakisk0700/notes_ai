// Export the enum type first
export type UserRole = 'user' | 'admin';

export interface Profile {
  id: string; // UUID as string
  role: UserRole; // user_role enum with default 'user'
  created_at: Date; // timestamp with time zone
  updated_at: Date; // timestamp with time zone
  first_name: string | null; // text, nullable
  last_name: string | null; // text, nullable
  phone_number: string | null; // text, nullable
}

// Optional: Create a type for creating new profiles (without auto-generated fields)
export interface CreateProfileInput {
  id: string; // Required since it's not auto-generated
  role?: UserRole; // Optional since it has a default value
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
}

// Optional: Create a type for updating profiles
export interface UpdateProfileInput {
  role?: UserRole;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  updated_at?: Date;
}
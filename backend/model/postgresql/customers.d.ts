export interface Customer {
  id: string; // UUID as string
  created_at: Date; // timestamp with time zone
  name: string | null; // character varying, nullable
}

// Optional: Create a type for creating new customers (without auto-generated fields)
export interface CreateCustomerInput {
  name?: string | null;
}

// Optional: Create a type for updating customers
export interface UpdateCustomerInput {
  name?: string | null;
}
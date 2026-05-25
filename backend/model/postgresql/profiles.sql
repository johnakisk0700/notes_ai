CREATE TYPE public.user_role AS ENUM (
    'user',
    'admin' 
    -- Add other roles as needed
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  role user_role DEFAULT 'user'::user_role,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  first_name text,
  last_name text,
  phone_number text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

-- Indexes for profiles table
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_created_at ON public.profiles(created_at);
CREATE INDEX idx_profiles_updated_at ON public.profiles(updated_at);
CREATE INDEX idx_profiles_first_name ON public.profiles(first_name);
CREATE INDEX idx_profiles_last_name ON public.profiles(last_name);
CREATE INDEX idx_profiles_phone_number ON public.profiles(phone_number);

-- Composite indexes for common query patterns
CREATE INDEX idx_profiles_role_created_at ON public.profiles(role, created_at);
CREATE INDEX idx_profiles_last_name_first_name ON public.profiles(last_name, first_name);

-- Partial index for admin users (if they're queried frequently)
CREATE INDEX idx_profiles_admin_users ON public.profiles(created_at) WHERE role = 'admin';
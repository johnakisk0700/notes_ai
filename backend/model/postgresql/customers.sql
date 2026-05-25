CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name character varying,
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);

-- Index for ordering by creation time (for recent customers)
CREATE INDEX idx_customers_created_at ON public.customers (created_at DESC);

-- Index for name searches (case-sensitive)
CREATE INDEX idx_customers_name ON public.customers (name);

-- Case-insensitive index for name searches
CREATE INDEX idx_customers_name_lower ON public.customers (LOWER(name));

-- Text search index for name searches (if full-text search is needed)
CREATE INDEX idx_customers_name_gin ON public.customers USING gin(to_tsvector('english', name));

-- Partial index for non-null names only (if many records have null names)
CREATE INDEX idx_customers_name_not_null ON public.customers (name) WHERE name IS NOT NULL;
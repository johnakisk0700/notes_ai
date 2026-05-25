CREATE TABLE public.chats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chats_pkey PRIMARY KEY (id)
);

-- Index for queries filtering by user_id (most common use case)
CREATE INDEX idx_chats_user_id ON public.chats (user_id);

-- Index for ordering by creation time (for recent chats)
CREATE INDEX idx_chats_created_at ON public.chats (created_at DESC);

-- Index for ordering by update time (for recently modified chats)
CREATE INDEX idx_chats_updated_at ON public.chats (updated_at DESC);

-- Composite index for user-specific chats ordered by creation time
CREATE INDEX idx_chats_user_created ON public.chats (user_id, created_at DESC);

-- Composite index for user-specific chats ordered by update time
CREATE INDEX idx_chats_user_updated ON public.chats (user_id, updated_at DESC);

-- Text search index for title searches (if full-text search is needed)
CREATE INDEX idx_chats_title_gin ON public.chats USING gin(to_tsvector('english', title));
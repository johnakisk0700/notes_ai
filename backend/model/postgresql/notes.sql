CREATE TABLE public.notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT notes_pkey PRIMARY KEY (id)
);

-- Index for finding notes by user_id (most common query pattern)
CREATE INDEX idx_notes_user_id ON public.notes (user_id);

-- Index for ordering notes by creation date (for pagination/sorting)
CREATE INDEX idx_notes_created_at ON public.notes (created_at);

-- Index for ordering notes by update date (for recently modified queries)
CREATE INDEX idx_notes_updated_at ON public.notes (updated_at);

-- Composite index for user-specific date-ordered queries
CREATE INDEX idx_notes_user_created ON public.notes (user_id, created_at DESC);

-- Index on title for searching by title
CREATE INDEX idx_notes_title ON public.notes (title);

-- Composite index for user-specific title searches
CREATE INDEX idx_notes_user_title ON public.notes (user_id, title);

-- Full-text search index for both title and content searching
CREATE INDEX idx_notes_content_fts ON public.notes USING gin(to_tsvector('english', coalesce(title, '') || ' ' || content));
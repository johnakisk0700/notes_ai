CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL,
  content text NOT NULL,
  is_user boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id)
);

-- Index for queries filtering by chat_id (most common use case)
CREATE INDEX idx_messages_chat_id ON public.messages (chat_id);

-- Composite index for chat messages ordered by creation time
CREATE INDEX idx_messages_chat_created ON public.messages (chat_id, created_at);

-- Index for filtering by message type (user vs assistant)
CREATE INDEX idx_messages_is_user ON public.messages (is_user);

-- Composite index for chat-specific message type queries
CREATE INDEX idx_messages_chat_user ON public.messages (chat_id, is_user);

-- Index for ordering by creation time globally
CREATE INDEX idx_messages_created_at ON public.messages (created_at DESC);

-- Text search index for content searches (if full-text search is needed)
CREATE INDEX idx_messages_content_gin ON public.messages USING gin(to_tsvector('english', content));

-- Composite index for chat messages with type and time ordering
CREATE INDEX idx_messages_chat_user_created ON public.messages (chat_id, is_user, created_at);
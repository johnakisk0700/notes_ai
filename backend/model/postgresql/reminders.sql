CREATE TYPE public.reminder_status AS ENUM (
    'pending',
    'completed'
    -- Add other statuses as needed
);

CREATE TABLE public.reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL,
  user_id uuid NOT NULL,
  remind_at timestamp with time zone NOT NULL,
  status reminder_status DEFAULT 'pending'::reminder_status,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT reminders_pkey PRIMARY KEY (id),
  CONSTRAINT reminders_note_id_unique UNIQUE (note_id), -- Add this line
  CONSTRAINT reminders_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE
);

-- Indexes for reminders table
CREATE INDEX idx_reminders_user_id ON public.reminders(user_id);
CREATE INDEX idx_reminders_note_id ON public.reminders(note_id);
CREATE INDEX idx_reminders_status ON public.reminders(status);
CREATE INDEX idx_reminders_remind_at ON public.reminders(remind_at);
CREATE INDEX idx_reminders_created_at ON public.reminders(created_at);
CREATE INDEX idx_reminders_updated_at ON public.reminders(updated_at);

-- Composite indexes for common query patterns
CREATE INDEX idx_reminders_user_status ON public.reminders(user_id, status);
CREATE INDEX idx_reminders_user_remind_at ON public.reminders(user_id, remind_at);
CREATE INDEX idx_reminders_status_remind_at ON public.reminders(status, remind_at);

-- Partial indexes for performance
CREATE INDEX idx_reminders_pending_remind_at ON public.reminders(remind_at) WHERE status = 'pending';
CREATE INDEX idx_reminders_user_pending ON public.reminders(user_id, remind_at) WHERE status = 'pending';

-- Index for cleanup queries
CREATE INDEX idx_reminders_completed_created_at ON public.reminders(created_at) WHERE status = 'completed';
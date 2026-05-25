CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('pending', 'completed');--> statement-breakpoint
CREATE TABLE "kataskopos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"model" varchar(100) NOT NULL,
	"input_cost" numeric(19, 10) DEFAULT '0' NOT NULL,
	"output_cost" numeric(19, 10) DEFAULT '0' NOT NULL,
	"total_cost" numeric(19, 10) DEFAULT '0' NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"content" text NOT NULL,
	"is_user" boolean DEFAULT true NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" text PRIMARY KEY NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"display_name" text,
	"settings" jsonb DEFAULT '{"theme":"system","notifications":{"desktop":true,"email":false},"language":"en"}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"status" "reminder_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tefteri" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"total_cost" numeric(19, 10) DEFAULT '0' NOT NULL,
	"query_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_thread_id" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_kataskopos_user_id" ON "kataskopos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_kataskopos_timestamp" ON "kataskopos" USING btree ("timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_kataskopos_user_timestamp" ON "kataskopos" USING btree ("user_id","timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_kataskopos_model" ON "kataskopos" USING btree ("model");--> statement-breakpoint
CREATE INDEX "idx_messages_thread_id" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_messages_thread_created" ON "messages" USING btree ("thread_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_messages_role" ON "messages" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_messages_thread_role" ON "messages" USING btree ("thread_id","role");--> statement-breakpoint
CREATE INDEX "idx_messages_created_at" ON "messages" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_messages_content_gin" ON "messages" USING gin (to_tsvector('english', "content"));--> statement-breakpoint
CREATE INDEX "idx_messages_thread_role_created" ON "messages" USING btree ("thread_id","role","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_notes_user_id" ON "notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notes_user_created_desc" ON "notes" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_notes_user_updated_desc" ON "notes" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_notes_user_title" ON "notes" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "idx_notes_content_fts" ON "notes" USING gin (to_tsvector('english', coalesce("title", '') || ' ' || "content"));--> statement-breakpoint
CREATE INDEX "idx_profile_role" ON "profile" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_profile_created_at" ON "profile" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_note_id_unique" ON "reminders" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "idx_reminders_user_id" ON "reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_reminders_pending_remind_at" ON "reminders" USING btree ("remind_at") WHERE "reminders"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_reminders_user_pending" ON "reminders" USING btree ("user_id","remind_at") WHERE "reminders"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_tefteri_created_at" ON "tefteri" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_tefteri_user_id_created_at" ON "tefteri" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_threads_user_id" ON "threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_threads_user_last_message" ON "threads" USING btree ("user_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_threads_user_created" ON "threads" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_threads_user_updated" ON "threads" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_threads_user_active" ON "threads" USING btree ("user_id","is_archived","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_threads_user_pinned" ON "threads" USING btree ("user_id","is_pinned");--> statement-breakpoint
CREATE INDEX "idx_threads_created_at" ON "threads" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_threads_last_message_at" ON "threads" USING btree ("last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_threads_search" ON "threads" USING gin (to_tsvector('english', "title" || ' ' || coalesce("description", '')));
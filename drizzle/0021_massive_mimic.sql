CREATE TABLE "plan" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"price_cents" integer,
	"max_contacts" integer,
	"max_members" integer,
	"max_channels" integer,
	"max_conversations_month" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plan_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "plan_blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_superadmin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE restrict ON UPDATE no action;
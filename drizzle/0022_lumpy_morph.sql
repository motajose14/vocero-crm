ALTER TABLE "meta_credentials" ADD COLUMN "app_secret_cipher" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "app_secret_iv" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "app_secret_tag" text;
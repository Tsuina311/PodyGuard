ALTER TABLE "events" ADD COLUMN "allow_three_pods" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "allow_five_pods" boolean DEFAULT false NOT NULL;

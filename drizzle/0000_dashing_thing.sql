-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "PushSubscription" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"expirationTime" timestamp(3),
	"userAgent" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PushReminderLog" (
	"id" text PRIMARY KEY NOT NULL,
	"subscriptionId" text NOT NULL,
	"scheduleId" text NOT NULL,
	"scheduledFor" timestamp(3) NOT NULL,
	"sentAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Clip" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"thumbnailUrl" text,
	"description" text,
	"clipDate" timestamp(3),
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"scheduleId" text
);
--> statement-breakpoint
CREATE TABLE "Schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"startTime" timestamp(3) NOT NULL,
	"endTime" timestamp(3),
	"isGuerrilla" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"gameId" text,
	"isLiveEnded" boolean DEFAULT false NOT NULL,
	"isNaeJeon" boolean DEFAULT false NOT NULL,
	"liveUrls" text[]
);
--> statement-breakpoint
CREATE TABLE "Streamer" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"handle" text NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"role" text,
	"platform" text DEFAULT 'CHZZK' NOT NULL,
	"profileImg" text,
	"colorCode" text DEFAULT '#673AB7' NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"chzzkUrl" text,
	"bio" text,
	"isGuest" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "ScheduleParticipant" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduleId" text NOT NULL,
	"streamerId" text NOT NULL,
	"nation" text,
	"result" text,
	"isGuest" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ClipParticipant" (
	"id" text PRIMARY KEY NOT NULL,
	"clipId" text NOT NULL,
	"streamerId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Game" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"isHoi4" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"streamerId" text,
	"streamerName" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "VerificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp(3),
	"image" text,
	"role" text DEFAULT 'USER' NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Account" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "Session" (
	"id" text PRIMARY KEY NOT NULL,
	"sessionToken" text NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp(3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "PushReminderLog" ADD CONSTRAINT "PushReminderLog_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."PushSubscription"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."Schedule"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ScheduleParticipant" ADD CONSTRAINT "ScheduleParticipant_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."Schedule"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ScheduleParticipant" ADD CONSTRAINT "ScheduleParticipant_streamerId_fkey" FOREIGN KEY ("streamerId") REFERENCES "public"."Streamer"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ClipParticipant" ADD CONSTRAINT "ClipParticipant_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "public"."Clip"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ClipParticipant" ADD CONSTRAINT "ClipParticipant_streamerId_fkey" FOREIGN KEY ("streamerId") REFERENCES "public"."Streamer"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription" USING btree ("endpoint" text_ops);--> statement-breakpoint
CREATE INDEX "PushReminderLog_scheduleId_scheduledFor_idx" ON "PushReminderLog" USING btree ("scheduleId" text_ops,"scheduledFor" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "PushReminderLog_subscriptionId_scheduleId_key" ON "PushReminderLog" USING btree ("subscriptionId" text_ops,"scheduleId" text_ops);--> statement-breakpoint
CREATE INDEX "Clip_scheduleId_idx" ON "Clip" USING btree ("scheduleId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Streamer_handle_key" ON "Streamer" USING btree ("handle" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Streamer_name_key" ON "Streamer" USING btree ("name" text_ops);--> statement-breakpoint
CREATE INDEX "ScheduleParticipant_scheduleId_idx" ON "ScheduleParticipant" USING btree ("scheduleId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ScheduleParticipant_scheduleId_streamerId_key" ON "ScheduleParticipant" USING btree ("scheduleId" text_ops,"streamerId" text_ops);--> statement-breakpoint
CREATE INDEX "ScheduleParticipant_streamerId_idx" ON "ScheduleParticipant" USING btree ("streamerId" text_ops);--> statement-breakpoint
CREATE INDEX "ClipParticipant_clipId_idx" ON "ClipParticipant" USING btree ("clipId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ClipParticipant_clipId_streamerId_key" ON "ClipParticipant" USING btree ("clipId" text_ops,"streamerId" text_ops);--> statement-breakpoint
CREATE INDEX "ClipParticipant_streamerId_idx" ON "ClipParticipant" USING btree ("streamerId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Game_title_key" ON "Game" USING btree ("title" text_ops);--> statement-breakpoint
CREATE INDEX "Feedback_streamerId_idx" ON "Feedback" USING btree ("streamerId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken" USING btree ("identifier" text_ops,"token" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken" USING btree ("token" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "User_email_key" ON "User" USING btree ("email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account" USING btree ("provider" text_ops,"providerAccountId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session" USING btree ("sessionToken" text_ops);
*/
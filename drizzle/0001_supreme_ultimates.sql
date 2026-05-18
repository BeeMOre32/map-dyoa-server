ALTER TABLE "PushReminderLog" DROP CONSTRAINT "PushReminderLog_subscriptionId_fkey";
--> statement-breakpoint
ALTER TABLE "Clip" DROP CONSTRAINT "Clip_scheduleId_fkey";
--> statement-breakpoint
ALTER TABLE "Schedule" DROP CONSTRAINT "Schedule_gameId_fkey";
--> statement-breakpoint
ALTER TABLE "ScheduleParticipant" DROP CONSTRAINT "ScheduleParticipant_scheduleId_fkey";
--> statement-breakpoint
ALTER TABLE "ScheduleParticipant" DROP CONSTRAINT "ScheduleParticipant_streamerId_fkey";
--> statement-breakpoint
ALTER TABLE "ClipParticipant" DROP CONSTRAINT "ClipParticipant_clipId_fkey";
--> statement-breakpoint
ALTER TABLE "ClipParticipant" DROP CONSTRAINT "ClipParticipant_streamerId_fkey";
--> statement-breakpoint
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";
--> statement-breakpoint
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";
--> statement-breakpoint
DROP INDEX "PushSubscription_endpoint_key";--> statement-breakpoint
DROP INDEX "Streamer_handle_key";--> statement-breakpoint
DROP INDEX "Streamer_name_key";--> statement-breakpoint
DROP INDEX "Game_title_key";--> statement-breakpoint
DROP INDEX "User_email_key";--> statement-breakpoint
DROP INDEX "Session_sessionToken_key";--> statement-breakpoint
DROP INDEX "PushReminderLog_scheduleId_scheduledFor_idx";--> statement-breakpoint
DROP INDEX "PushReminderLog_subscriptionId_scheduleId_key";--> statement-breakpoint
DROP INDEX "Clip_scheduleId_idx";--> statement-breakpoint
DROP INDEX "ScheduleParticipant_scheduleId_idx";--> statement-breakpoint
DROP INDEX "ScheduleParticipant_scheduleId_streamerId_key";--> statement-breakpoint
DROP INDEX "ScheduleParticipant_streamerId_idx";--> statement-breakpoint
DROP INDEX "ClipParticipant_clipId_idx";--> statement-breakpoint
DROP INDEX "ClipParticipant_clipId_streamerId_key";--> statement-breakpoint
DROP INDEX "ClipParticipant_streamerId_idx";--> statement-breakpoint
DROP INDEX "Feedback_streamerId_idx";--> statement-breakpoint
DROP INDEX "VerificationToken_identifier_token_key";--> statement-breakpoint
DROP INDEX "VerificationToken_token_key";--> statement-breakpoint
DROP INDEX "Account_provider_providerAccountId_key";--> statement-breakpoint
ALTER TABLE "PushSubscription" ALTER COLUMN "expirationTime" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "PushSubscription" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "PushSubscription" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "PushSubscription" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "PushSubscription" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "PushReminderLog" ALTER COLUMN "scheduledFor" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "PushReminderLog" ALTER COLUMN "sentAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "PushReminderLog" ALTER COLUMN "sentAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Clip" ALTER COLUMN "clipDate" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Clip" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Clip" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Schedule" ALTER COLUMN "startTime" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Schedule" ALTER COLUMN "endTime" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Schedule" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Schedule" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Schedule" ALTER COLUMN "liveUrls" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "Schedule" ALTER COLUMN "liveUrls" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Streamer" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Streamer" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Streamer" ALTER COLUMN "isGuest" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Feedback" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Feedback" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Feedback" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Feedback" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "VerificationToken" ALTER COLUMN "expires" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "emailVerified" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Session" ALTER COLUMN "expires" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Streamer" ADD COLUMN "youtubeUrl" text;--> statement-breakpoint
ALTER TABLE "PushReminderLog" ADD CONSTRAINT "PushReminderLog_subscriptionId_PushSubscription_id_fk" FOREIGN KEY ("subscriptionId") REFERENCES "public"."PushSubscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_scheduleId_Schedule_id_fk" FOREIGN KEY ("scheduleId") REFERENCES "public"."Schedule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_gameId_Game_id_fk" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ScheduleParticipant" ADD CONSTRAINT "ScheduleParticipant_scheduleId_Schedule_id_fk" FOREIGN KEY ("scheduleId") REFERENCES "public"."Schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ScheduleParticipant" ADD CONSTRAINT "ScheduleParticipant_streamerId_Streamer_id_fk" FOREIGN KEY ("streamerId") REFERENCES "public"."Streamer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ClipParticipant" ADD CONSTRAINT "ClipParticipant_clipId_Clip_id_fk" FOREIGN KEY ("clipId") REFERENCES "public"."Clip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ClipParticipant" ADD CONSTRAINT "ClipParticipant_streamerId_Streamer_id_fk" FOREIGN KEY ("streamerId") REFERENCES "public"."Streamer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "PushReminderLog_scheduleId_scheduledFor_idx" ON "PushReminderLog" USING btree ("scheduleId","scheduledFor");--> statement-breakpoint
CREATE UNIQUE INDEX "PushReminderLog_subscriptionId_scheduleId_key" ON "PushReminderLog" USING btree ("subscriptionId","scheduleId");--> statement-breakpoint
CREATE INDEX "Clip_scheduleId_idx" ON "Clip" USING btree ("scheduleId");--> statement-breakpoint
CREATE INDEX "ScheduleParticipant_scheduleId_idx" ON "ScheduleParticipant" USING btree ("scheduleId");--> statement-breakpoint
CREATE UNIQUE INDEX "ScheduleParticipant_scheduleId_streamerId_key" ON "ScheduleParticipant" USING btree ("scheduleId","streamerId");--> statement-breakpoint
CREATE INDEX "ScheduleParticipant_streamerId_idx" ON "ScheduleParticipant" USING btree ("streamerId");--> statement-breakpoint
CREATE INDEX "ClipParticipant_clipId_idx" ON "ClipParticipant" USING btree ("clipId");--> statement-breakpoint
CREATE UNIQUE INDEX "ClipParticipant_clipId_streamerId_key" ON "ClipParticipant" USING btree ("clipId","streamerId");--> statement-breakpoint
CREATE INDEX "ClipParticipant_streamerId_idx" ON "ClipParticipant" USING btree ("streamerId");--> statement-breakpoint
CREATE INDEX "Feedback_streamerId_idx" ON "Feedback" USING btree ("streamerId");--> statement-breakpoint
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken" USING btree ("identifier","token");--> statement-breakpoint
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account" USING btree ("provider","providerAccountId");--> statement-breakpoint
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_endpoint_unique" UNIQUE("endpoint");--> statement-breakpoint
ALTER TABLE "Streamer" ADD CONSTRAINT "Streamer_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "Streamer" ADD CONSTRAINT "Streamer_handle_unique" UNIQUE("handle");--> statement-breakpoint
ALTER TABLE "Game" ADD CONSTRAINT "Game_title_unique" UNIQUE("title");--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "Session" ADD CONSTRAINT "Session_sessionToken_unique" UNIQUE("sessionToken");
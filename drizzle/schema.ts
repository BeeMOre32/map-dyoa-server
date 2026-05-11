import { pgTable, uniqueIndex, text, timestamp, index, foreignKey, boolean, integer } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const pushSubscription = pgTable("PushSubscription", {
	id: text().primaryKey().notNull(),
	endpoint: text().notNull(),
	p256Dh: text().notNull(),
	auth: text().notNull(),
	expirationTime: timestamp({ precision: 3, mode: 'string' }),
	userAgent: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	uniqueIndex("PushSubscription_endpoint_key").using("btree", table.endpoint.asc().nullsLast().op("text_ops")),
]);

export const pushReminderLog = pgTable("PushReminderLog", {
	id: text().primaryKey().notNull(),
	subscriptionId: text().notNull(),
	scheduleId: text().notNull(),
	scheduledFor: timestamp({ precision: 3, mode: 'string' }).notNull(),
	sentAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("PushReminderLog_scheduleId_scheduledFor_idx").using("btree", table.scheduleId.asc().nullsLast().op("text_ops"), table.scheduledFor.asc().nullsLast().op("text_ops")),
	uniqueIndex("PushReminderLog_subscriptionId_scheduleId_key").using("btree", table.subscriptionId.asc().nullsLast().op("text_ops"), table.scheduleId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.subscriptionId],
			foreignColumns: [pushSubscription.id],
			name: "PushReminderLog_subscriptionId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const clip = pgTable("Clip", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	url: text().notNull(),
	thumbnailUrl: text(),
	description: text(),
	clipDate: timestamp({ precision: 3, mode: 'string' }),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	scheduleId: text(),
}, (table) => [
	index("Clip_scheduleId_idx").using("btree", table.scheduleId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.scheduleId],
			foreignColumns: [schedule.id],
			name: "Clip_scheduleId_fkey"
		}).onUpdate("cascade").onDelete("set null"),
]);

export const schedule = pgTable("Schedule", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	content: text(),
	startTime: timestamp({ precision: 3, mode: 'string' }).notNull(),
	endTime: timestamp({ precision: 3, mode: 'string' }),
	isGuerrilla: boolean().default(false).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	gameId: text(),
	isLiveEnded: boolean().default(false).notNull(),
	isNaeJeon: boolean().default(false).notNull(),
	liveUrls: text().array(),
}, (table) => [
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [game.id],
			name: "Schedule_gameId_fkey"
		}).onUpdate("cascade").onDelete("set null"),
]);

export const streamer = pgTable("Streamer", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	handle: text().notNull(),
	generation: integer().default(1).notNull(),
	role: text(),
	platform: text().default('CHZZK').notNull(),
	profileImg: text(),
	colorCode: text().default('#673AB7').notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	chzzkUrl: text(),
	bio: text(),
	isGuest: boolean().default(false),
}, (table) => [
	uniqueIndex("Streamer_handle_key").using("btree", table.handle.asc().nullsLast().op("text_ops")),
	uniqueIndex("Streamer_name_key").using("btree", table.name.asc().nullsLast().op("text_ops")),
]);

export const scheduleParticipant = pgTable("ScheduleParticipant", {
	id: text().primaryKey().notNull(),
	scheduleId: text().notNull(),
	streamerId: text().notNull(),
	nation: text(),
	result: text(),
	isGuest: boolean().default(false).notNull(),
}, (table) => [
	index("ScheduleParticipant_scheduleId_idx").using("btree", table.scheduleId.asc().nullsLast().op("text_ops")),
	uniqueIndex("ScheduleParticipant_scheduleId_streamerId_key").using("btree", table.scheduleId.asc().nullsLast().op("text_ops"), table.streamerId.asc().nullsLast().op("text_ops")),
	index("ScheduleParticipant_streamerId_idx").using("btree", table.streamerId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.scheduleId],
			foreignColumns: [schedule.id],
			name: "ScheduleParticipant_scheduleId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.streamerId],
			foreignColumns: [streamer.id],
			name: "ScheduleParticipant_streamerId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const clipParticipant = pgTable("ClipParticipant", {
	id: text().primaryKey().notNull(),
	clipId: text().notNull(),
	streamerId: text().notNull(),
}, (table) => [
	index("ClipParticipant_clipId_idx").using("btree", table.clipId.asc().nullsLast().op("text_ops")),
	uniqueIndex("ClipParticipant_clipId_streamerId_key").using("btree", table.clipId.asc().nullsLast().op("text_ops"), table.streamerId.asc().nullsLast().op("text_ops")),
	index("ClipParticipant_streamerId_idx").using("btree", table.streamerId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clipId],
			foreignColumns: [clip.id],
			name: "ClipParticipant_clipId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.streamerId],
			foreignColumns: [streamer.id],
			name: "ClipParticipant_streamerId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const game = pgTable("Game", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	isHoi4: boolean().default(false).notNull(),
}, (table) => [
	uniqueIndex("Game_title_key").using("btree", table.title.asc().nullsLast().op("text_ops")),
]);

export const feedback = pgTable("Feedback", {
	id: text().primaryKey().notNull(),
	type: text().notNull(),
	category: text().notNull(),
	content: text().notNull(),
	streamerId: text(),
	streamerName: text(),
	status: text().default('PENDING').notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("Feedback_streamerId_idx").using("btree", table.streamerId.asc().nullsLast().op("text_ops")),
]);

export const verificationToken = pgTable("VerificationToken", {
	identifier: text().notNull(),
	token: text().notNull(),
	expires: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	uniqueIndex("VerificationToken_identifier_token_key").using("btree", table.identifier.asc().nullsLast().op("text_ops"), table.token.asc().nullsLast().op("text_ops")),
	uniqueIndex("VerificationToken_token_key").using("btree", table.token.asc().nullsLast().op("text_ops")),
]);

export const user = pgTable("User", {
	id: text().primaryKey().notNull(),
	name: text(),
	email: text(),
	emailVerified: timestamp({ precision: 3, mode: 'string' }),
	image: text(),
	role: text().default('USER').notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	uniqueIndex("User_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
]);

export const account = pgTable("Account", {
	id: text().primaryKey().notNull(),
	userId: text().notNull(),
	type: text().notNull(),
	provider: text().notNull(),
	providerAccountId: text().notNull(),
	refreshToken: text("refresh_token"),
	accessToken: text("access_token"),
	expiresAt: integer("expires_at"),
	tokenType: text("token_type"),
	scope: text(),
	idToken: text("id_token"),
	sessionState: text("session_state"),
}, (table) => [
	uniqueIndex("Account_provider_providerAccountId_key").using("btree", table.provider.asc().nullsLast().op("text_ops"), table.providerAccountId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Account_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const session = pgTable("Session", {
	id: text().primaryKey().notNull(),
	sessionToken: text().notNull(),
	userId: text().notNull(),
	expires: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	uniqueIndex("Session_sessionToken_key").using("btree", table.sessionToken.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Session_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

import { relations } from "drizzle-orm/relations";
import { pushSubscription, pushReminderLog, schedule, clip, game, scheduleParticipant, streamer, clipParticipant, user, account, session } from "./schema";

export const pushReminderLogRelations = relations(pushReminderLog, ({one}) => ({
	pushSubscription: one(pushSubscription, {
		fields: [pushReminderLog.subscriptionId],
		references: [pushSubscription.id]
	}),
}));

export const pushSubscriptionRelations = relations(pushSubscription, ({many}) => ({
	pushReminderLogs: many(pushReminderLog),
}));

export const clipRelations = relations(clip, ({one, many}) => ({
	schedule: one(schedule, {
		fields: [clip.scheduleId],
		references: [schedule.id]
	}),
	clipParticipants: many(clipParticipant),
}));

export const scheduleRelations = relations(schedule, ({one, many}) => ({
	clips: many(clip),
	game: one(game, {
		fields: [schedule.gameId],
		references: [game.id]
	}),
	scheduleParticipants: many(scheduleParticipant),
}));

export const gameRelations = relations(game, ({many}) => ({
	schedules: many(schedule),
}));

export const scheduleParticipantRelations = relations(scheduleParticipant, ({one}) => ({
	schedule: one(schedule, {
		fields: [scheduleParticipant.scheduleId],
		references: [schedule.id]
	}),
	streamer: one(streamer, {
		fields: [scheduleParticipant.streamerId],
		references: [streamer.id]
	}),
}));

export const streamerRelations = relations(streamer, ({many}) => ({
	scheduleParticipants: many(scheduleParticipant),
	clipParticipants: many(clipParticipant),
}));

export const clipParticipantRelations = relations(clipParticipant, ({one}) => ({
	clip: one(clip, {
		fields: [clipParticipant.clipId],
		references: [clip.id]
	}),
	streamer: one(streamer, {
		fields: [clipParticipant.streamerId],
		references: [streamer.id]
	}),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	accounts: many(account),
	sessions: many(session),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));
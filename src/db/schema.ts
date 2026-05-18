/**
 * map-dyoa `prisma/schema.prisma`와 동일한 PostgreSQL 구조.
 * 테이블·컬럼명은 Prisma 기본 매핑(PascalCase 테이블, camelCase 컬럼)을 따름.
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// --- Streamer ---

export const streamers = pgTable("Streamer", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  handle: text("handle").notNull().unique(),
  generation: integer("generation").notNull().default(1),
  role: text("role"),
  platform: text("platform").notNull().default("CHZZK"),
  profileImg: text("profileImg"),
  colorCode: text("colorCode").notNull().default("#673AB7"),
  chzzkUrl: text("chzzkUrl"),
  youtubeUrl: text("youtubeUrl"),
  bio: text("bio"),
  isGuest: boolean("isGuest").notNull().default(false),
  createdAt: timestamp("createdAt", { precision: 3, withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- Game ---

export const games = pgTable("Game", {
  id: text("id").primaryKey(),
  title: text("title").notNull().unique(),
  isHoi4: boolean("isHoi4").notNull().default(false),
});

// --- Schedule ---

export const schedules = pgTable(
  "Schedule",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content"),
    startTime: timestamp("startTime", {
      precision: 3,
      withTimezone: true,
    }).notNull(),
    endTime: timestamp("endTime", { precision: 3, withTimezone: true }),
    isGuerrilla: boolean("isGuerrilla").notNull().default(false),
    isNaeJeon: boolean("isNaeJeon").notNull().default(false),
    isLiveEnded: boolean("isLiveEnded").notNull().default(false),
    liveUrls: text("liveUrls")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    gameId: text("gameId").references(() => games.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

// --- ScheduleParticipant ---

export const scheduleParticipants = pgTable(
  "ScheduleParticipant",
  {
    id: text("id").primaryKey(),
    scheduleId: text("scheduleId")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    streamerId: text("streamerId")
      .notNull()
      .references(() => streamers.id, { onDelete: "cascade" }),
    nation: text("nation"),
    result: text("result"),
    isGuest: boolean("isGuest").notNull().default(false),
  },
  (t) => ({
    scheduleStreamerUnique: uniqueIndex(
      "ScheduleParticipant_scheduleId_streamerId_key",
    ).on(t.scheduleId, t.streamerId),
    scheduleIdIdx: index("ScheduleParticipant_scheduleId_idx").on(t.scheduleId),
    streamerIdIdx: index("ScheduleParticipant_streamerId_idx").on(t.streamerId),
  }),
);

// --- Clip ---

export const clips = pgTable(
  "Clip",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnailUrl"),
    description: text("description"),
    clipDate: timestamp("clipDate", { precision: 3, withTimezone: true }),
    scheduleId: text("scheduleId").references(() => schedules.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    scheduleIdIdx: index("Clip_scheduleId_idx").on(t.scheduleId),
  }),
);

// --- ClipParticipant ---

export const clipParticipants = pgTable(
  "ClipParticipant",
  {
    id: text("id").primaryKey(),
    clipId: text("clipId")
      .notNull()
      .references(() => clips.id, { onDelete: "cascade" }),
    streamerId: text("streamerId")
      .notNull()
      .references(() => streamers.id, { onDelete: "cascade" }),
  },
  (t) => ({
    clipStreamerUnique: uniqueIndex("ClipParticipant_clipId_streamerId_key").on(
      t.clipId,
      t.streamerId,
    ),
    clipIdIdx: index("ClipParticipant_clipId_idx").on(t.clipId),
    streamerIdIdx: index("ClipParticipant_streamerId_idx").on(t.streamerId),
  }),
);

// --- Feedback ---

export const feedbacks = pgTable(
  "Feedback",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    category: text("category").notNull(),
    content: text("content").notNull(),
    streamerId: text("streamerId"),
    streamerName: text("streamerName"),
    status: text("status").notNull().default("PENDING"),
    createdAt: timestamp("createdAt", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    streamerIdIdx: index("Feedback_streamerId_idx").on(t.streamerId),
  }),
);

// --- NextAuth: User, Account, Session ---

export const users = pgTable("User", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", {
    precision: 3,
    withTimezone: true,
  }),
  image: text("image"),
  role: text("role").notNull().default("USER"),
  createdAt: timestamp("createdAt", { precision: 3, withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3, withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable(
  "Account",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    providerAccountUnique: uniqueIndex(
      "Account_provider_providerAccountId_key",
    ).on(t.provider, t.providerAccountId),
  }),
);

export const sessions = pgTable("Session", {
  id: text("id").primaryKey(),
  sessionToken: text("sessionToken").notNull().unique(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { precision: 3, withTimezone: true }).notNull(),
});

/** Prisma에 단일 @id 없음: 복합 유니크 + token 유니크만 존재 */
export const verificationTokens = pgTable(
  "VerificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", {
      precision: 3,
      withTimezone: true,
    }).notNull(),
  },
  (t) => ({
    identifierTokenKey: uniqueIndex("VerificationToken_identifier_token_key").on(
      t.identifier,
      t.token,
    ),
    tokenKey: uniqueIndex("VerificationToken_token_key").on(t.token),
  }),
);

// --- Push (web push) ---

export const pushSubscriptions = pgTable("PushSubscription", {
  id: text("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  expirationTime: timestamp("expirationTime", {
    precision: 3,
    withTimezone: true,
  }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt", { precision: 3, withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3, withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pushReminderLogs = pgTable(
  "PushReminderLog",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscriptionId")
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
    scheduleId: text("scheduleId").notNull(),
    scheduledFor: timestamp("scheduledFor", {
      precision: 3,
      withTimezone: true,
    }).notNull(),
    sentAt: timestamp("sentAt", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    subScheduleUnique: uniqueIndex(
      "PushReminderLog_subscriptionId_scheduleId_key",
    ).on(t.subscriptionId, t.scheduleId),
    scheduleScheduledForIdx: index(
      "PushReminderLog_scheduleId_scheduledFor_idx",
    ).on(t.scheduleId, t.scheduledFor),
  }),
);

// --- Relations (선택: relational query API용) ---

export const streamersRelations = relations(streamers, ({ many }) => ({
  scheduleParticipants: many(scheduleParticipants),
  clipParticipants: many(clipParticipants),
}));

export const gamesRelations = relations(games, ({ many }) => ({
  schedules: many(schedules),
}));

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  game: one(games, { fields: [schedules.gameId], references: [games.id] }),
  participants: many(scheduleParticipants),
  clips: many(clips),
}));

export const scheduleParticipantsRelations = relations(
  scheduleParticipants,
  ({ one }) => ({
    schedule: one(schedules, {
      fields: [scheduleParticipants.scheduleId],
      references: [schedules.id],
    }),
    streamer: one(streamers, {
      fields: [scheduleParticipants.streamerId],
      references: [streamers.id],
    }),
  }),
);

export const clipsRelations = relations(clips, ({ one, many }) => ({
  schedule: one(schedules, {
    fields: [clips.scheduleId],
    references: [schedules.id],
  }),
  participants: many(clipParticipants),
}));

export const clipParticipantsRelations = relations(
  clipParticipants,
  ({ one }) => ({
    clip: one(clips, {
      fields: [clipParticipants.clipId],
      references: [clips.id],
    }),
    streamer: one(streamers, {
      fields: [clipParticipants.streamerId],
      references: [streamers.id],
    }),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const pushSubscriptionsRelations = relations(
  pushSubscriptions,
  ({ many }) => ({
    reminderLogs: many(pushReminderLogs),
  }),
);

export const pushReminderLogsRelations = relations(
  pushReminderLogs,
  ({ one }) => ({
    subscription: one(pushSubscriptions, {
      fields: [pushReminderLogs.subscriptionId],
      references: [pushSubscriptions.id],
    }),
  }),
);

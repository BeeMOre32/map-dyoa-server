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
    updatedAt: timestamp("updatedAt", { precision: 3, withTimezone: true })
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

// --- Auction (세력 입찰/라이브 경매) ---

export const auctionRooms = pgTable(
  "AuctionRoom",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    title: text("title").notNull(),
    /** LOBBY | LIVE | PAUSED | ENDED */
    status: text("status").notNull().default("LOBBY"),
    /** map-dyoa Schedule.id (선택) */
    scheduleId: text("scheduleId").references(() => schedules.id, {
      onDelete: "set null",
    }),
    /** 다음 호가 최소 증가폭 */
    minIncrement: integer("minIncrement").notNull().default(10),
    /** 0이면 타이머 미사용. 1 이상이면 호가 마감 카운트다운(초). 입찰 시 갱신(안티 스나이프) */
    timerSeconds: integer("timerSeconds").notNull().default(0),
    /** 현재 라운드 자동 마감 시각(타이머 사용 시) */
    currentEndsAt: timestamp("currentEndsAt", { precision: 3, withTimezone: true }),
    /** 현재 경매대에 오른 후보. 순환 FK를 피하려고 일반 text로 둠 */
    currentNomineeId: text("currentNomineeId"),
    hostToken: text("hostToken").notNull(),
    createdAt: timestamp("createdAt", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    scheduleIdIdx: index("AuctionRoom_scheduleId_idx").on(t.scheduleId),
  }),
);

export const auctionFactions = pgTable(
  "AuctionFaction",
  {
    id: text("id").primaryKey(),
    roomId: text("roomId")
      .notNull()
      .references(() => auctionRooms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    colorCode: text("colorCode").notNull().default("#673AB7"),
    joinToken: text("joinToken").notNull(),
    budgetTotal: integer("budgetTotal").notNull().default(1000),
    budgetRemaining: integer("budgetRemaining").notNull().default(1000),
    orderIndex: integer("orderIndex").notNull().default(1),
    createdAt: timestamp("createdAt", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    roomOrderUnique: uniqueIndex(
      "AuctionFaction_roomId_orderIndex_key",
    ).on(t.roomId, t.orderIndex),
    joinTokenIdx: index("AuctionFaction_joinToken_idx").on(t.joinToken),
    roomIdIdx: index("AuctionFaction_roomId_idx").on(t.roomId),
  }),
);

export const auctionNominees = pgTable(
  "AuctionNominee",
  {
    id: text("id").primaryKey(),
    roomId: text("roomId")
      .notNull()
      .references(() => auctionRooms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** HOI4 등 플레이 국가명(선택) */
    nation: text("nation"),
    imageUrl: text("imageUrl"),
    /** 나중에 map-dyoa Streamer와 연결하기 위한 훅(현재는 선택) */
    streamerId: text("streamerId").references(() => streamers.id, {
      onDelete: "set null",
    }),
    /** WAITING | ON_BLOCK | SOLD | UNSOLD */
    status: text("status").notNull().default("WAITING"),
    wonByFactionId: text("wonByFactionId"),
    finalPrice: integer("finalPrice"),
    orderIndex: integer("orderIndex").notNull().default(0),
    createdAt: timestamp("createdAt", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    roomIdIdx: index("AuctionNominee_roomId_idx").on(t.roomId),
    streamerIdIdx: index("AuctionNominee_streamerId_idx").on(t.streamerId),
  }),
);

export const auctionBids = pgTable(
  "AuctionBid",
  {
    id: text("id").primaryKey(),
    roomId: text("roomId")
      .notNull()
      .references(() => auctionRooms.id, { onDelete: "cascade" }),
    nomineeId: text("nomineeId")
      .notNull()
      .references(() => auctionNominees.id, { onDelete: "cascade" }),
    factionId: text("factionId")
      .notNull()
      .references(() => auctionFactions.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    createdAt: timestamp("createdAt", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    roomNomineeIdx: index("AuctionBid_roomId_nomineeId_idx").on(
      t.roomId,
      t.nomineeId,
    ),
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

export const auctionRoomsRelations = relations(auctionRooms, ({ one, many }) => ({
  schedule: one(schedules, {
    fields: [auctionRooms.scheduleId],
    references: [schedules.id],
  }),
  factions: many(auctionFactions),
  nominees: many(auctionNominees),
  bids: many(auctionBids),
}));

export const auctionFactionsRelations = relations(
  auctionFactions,
  ({ one, many }) => ({
    room: one(auctionRooms, {
      fields: [auctionFactions.roomId],
      references: [auctionRooms.id],
    }),
    bids: many(auctionBids),
  }),
);

export const auctionNomineesRelations = relations(
  auctionNominees,
  ({ one, many }) => ({
    room: one(auctionRooms, {
      fields: [auctionNominees.roomId],
      references: [auctionRooms.id],
    }),
    streamer: one(streamers, {
      fields: [auctionNominees.streamerId],
      references: [streamers.id],
    }),
    bids: many(auctionBids),
  }),
);

export const auctionBidsRelations = relations(auctionBids, ({ one }) => ({
  room: one(auctionRooms, {
    fields: [auctionBids.roomId],
    references: [auctionRooms.id],
  }),
  nominee: one(auctionNominees, {
    fields: [auctionBids.nomineeId],
    references: [auctionNominees.id],
  }),
  faction: one(auctionFactions, {
    fields: [auctionBids.factionId],
    references: [auctionFactions.id],
  }),
}));

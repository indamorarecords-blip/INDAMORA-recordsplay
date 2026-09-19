import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const artistsTable = pgTable("artists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  bio: text("bio").notNull(),
  location: text("location").notNull(),
  avatar: text("avatar"),
  worksCount: integer("works_count").notNull().default(0),
  ownerId: text("owner_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const worksTable = pgTable("works", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  duration: text("duration"),
  image: text("image").notNull(),
  mediaType: text("media_type"),
  mediaObjectPath: text("media_object_path"),
  coverObjectPath: text("cover_object_path"),
  featured: text("featured").notNull().default("false"),
  access: text("access").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const submissionsTable = pgTable("submissions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  category: text("category").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  ownerId: text("owner_id"),
  mediaType: text("media_type"),
  mediaObjectPath: text("media_object_path"),
  coverObjectPath: text("cover_object_path"),
  duration: text("duration"),
  publishedWorkId: integer("published_work_id"),
});

export const insertArtistSchema = createInsertSchema(artistsTable).omit({
  id: true,
  createdAt: true,
  worksCount: true,
});
export type InsertArtist = z.infer<typeof insertArtistSchema>;
export type Artist = typeof artistsTable.$inferSelect;

export const insertWorkSchema = createInsertSchema(worksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWork = z.infer<typeof insertWorkSchema>;
export type Work = typeof worksTable.$inferSelect;

export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit({
  id: true,
  submittedAt: true,
});
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissionsTable.$inferSelect;
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'

// Tables. After changing them run `pnpm db:sqlite:generate` to create a migration.
export const notes = sqliteTable('notes', {
  id: integer().primaryKey({ autoIncrement: true }),
  text: text().notNull(),
  // SQLite has no date type: stored as unix timestamp, exposed as a JS Date
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

// Types inferred from the table
export type Note = typeof notes.$inferSelect
export type NewNote = typeof notes.$inferInsert

// Zod schemas generated from the table (drizzle-zod) — refine columns as needed.
// Used to validate request bodies in the API routes.
export const noteSelectSchema = createSelectSchema(notes)
export const noteInsertSchema = createInsertSchema(notes, {
  text: schema => schema.trim().min(1, 'Text is required').max(200, 'Max 200 characters')
}).pick({ text: true })

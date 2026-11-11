import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'

// Tables. After changing them run `pnpm db:postgres:generate` to create a migration.
export const notes = pgTable('notes', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  text: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
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

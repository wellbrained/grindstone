// What the Debugging and Web fundamentals cheat sheets share (docs/features/ui.md, "Debugging cheat sheet"): the shape
// of a card once its texts are translated, the builder that turns a sheet's data and key helpers into sections of cards,
// and the filter. The Git and Working with AI sheets have their own data and do not use this.
import type { Level } from '../../shared/levels'

export type Translate = (key: string) => string

export interface CheatExampleView {
  line: string
  /** The `#` comment above the line. */
  note: string
  /** false: a plain row (a key, a status word), not a line you click to copy. */
  copy: boolean
}

export interface CheatCardView {
  id: string
  /** The card's heading: an entry's title, or the message a level quotes. */
  title: string
  /** A quoted message: the heading is set as data (mono) with a "!" in front. */
  message: boolean
  /** The one-line rule (for a message: what it usually means). */
  rule: string
  examples: CheatExampleView[]
  /** The label of the disclosure that holds `details` ("Why and how", "Look first"). */
  detailsLabel: string
  /** The longer text behind the disclosure (an entry's summary; for a message, where to look first). */
  details: string
  levels: Level[]
}

export interface CheatSectionView {
  id: string
  title: string
  cards: CheatCardView[]
}

export interface CheatShownCard extends CheatCardView {
  /** The filter found this card only in its details: the disclosure opens so the match is visible. */
  reveal: boolean
}

export interface CheatShownSection {
  id: string
  title: string
  cards: CheatShownCard[]
}

interface SourceEntry {
  id: string
  examples: readonly { line: string, copy?: false }[]
  levels: readonly string[]
}

interface SourceMessage {
  id: string
  message: string
  levels: readonly string[]
}

/** A sheet's data and the places of its texts in the locale; the Debugging and Web sheets each fill one in. */
export interface CheatSource {
  groups: readonly { id: string, entries: readonly SourceEntry[] }[]
  messages: readonly SourceMessage[]
  /** The id of the last section, which holds the messages (`errors`, `messages`). */
  messagesId: string
  keys: {
    group: (groupId: string) => string
    title: (entryId: string) => string
    rule: (entryId: string) => string
    summary: (entryId: string) => string
    note: (entryId: string, index: number) => string
    means: (messageId: string) => string
    look: (messageId: string) => string
  }
  /** The locale keys of the two disclosure labels: for an entry's summary, and for a message's "look first". */
  labels: { why: string, look: string }
  levels: (ids: readonly string[]) => Level[]
}

/** The sheet as sections of translated cards, in the order of the section chips: one per group, the messages last. */
export function buildCheatSheet(source: CheatSource, t: Translate): CheatSectionView[] {
  const { keys } = source
  const groups = source.groups.map(group => ({
    id: group.id,
    title: t(keys.group(group.id)),
    cards: group.entries.map((entry): CheatCardView => ({
      id: entry.id,
      title: t(keys.title(entry.id)),
      message: false,
      rule: t(keys.rule(entry.id)),
      examples: entry.examples.map((example, index) => ({ line: example.line, note: t(keys.note(entry.id, index)), copy: example.copy !== false })),
      detailsLabel: t(source.labels.why),
      details: t(keys.summary(entry.id)),
      levels: source.levels(entry.levels)
    }))
  }))
  const messages: CheatSectionView = {
    id: source.messagesId,
    title: t(keys.group(source.messagesId)),
    cards: source.messages.map((message): CheatCardView => ({
      id: message.id,
      title: message.message,
      message: true,
      rule: t(keys.means(message.id)),
      examples: [],
      detailsLabel: t(source.labels.look),
      details: t(keys.look(message.id)),
      levels: source.levels(message.levels)
    }))
  }
  return [...groups, messages]
}

/**
 * The cards the filter keeps, section by section (a section with none is left out). The filter reads the heading, the
 * rule, the example lines and notes, and the text behind the disclosure; a card that matches only through the last
 * has `reveal` set so its disclosure opens and the match can be seen.
 */
export function filterCheatSheet(sections: readonly CheatSectionView[], query: string): CheatShownSection[] {
  const q = query.trim().toLowerCase()
  const has = (texts: string[]) => texts.some(text => text.toLowerCase().includes(q))
  return sections
    .map(section => ({
      id: section.id,
      title: section.title,
      cards: section.cards.flatMap((card): CheatShownCard[] => {
        if (!q) return [{ ...card, reveal: false }]
        const outside = has([card.title, card.rule, ...card.examples.flatMap(example => [example.line, example.note])])
        const inside = has([card.details])
        return outside || inside ? [{ ...card, reveal: !outside }] : []
      })
    }))
    .filter(section => section.cards.length > 0)
}

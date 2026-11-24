// How a track shows itself in the Tracks menu and on the home page: an icon and one slot of the branch palette
// (DESIGN.md, "Track colours"). The slot is the track's own; its chapters keep theirs inside the track.
import type { ChapterColour } from '../../shared/levels'
import { paletteClass } from './branch-palette'

export interface TrackLook {
  icon: string
  colour: ChapterColour
  /** The `.branch-c-N` class of its colour. */
  class: string
}

const LOOKS: Record<string, Omit<TrackLook, 'class'>> = {
  git: { icon: 'i-lucide-git-branch', colour: 1 },
  debugging: { icon: 'i-lucide-bug', colour: 5 },
  ai: { icon: 'i-lucide-bot', colour: 2 },
  web: { icon: 'i-lucide-globe', colour: 0 },
  frameworks: { icon: 'i-lucide-atom', colour: 4 }
}

/** A track without a look of its own (a new one) gets a neutral layer icon and the quiet slot 6. */
export function trackLook(id: string): TrackLook {
  const look = LOOKS[id] ?? { icon: 'i-lucide-layers', colour: 6 }
  return { ...look, class: paletteClass(look.colour) }
}

// The ⋯ menus around progress (ADR 0006, "Redo, practise again, reset"): per entry (track page row and level page),
// per chapter and per track (track page), and Reset everything (About page). Every reset asks first (useConfirm) and
// says exactly what it clears.
import type { DropdownMenuItem } from '@nuxt/ui'
import { placeName, practiseAgainIn, summarizeProgress, trackLevels } from '#shared/levels'
import type { Chapter, Level, LevelPlace, Track } from '#shared/levels'

export function useProgressActions() {
  const { t } = useI18n()
  const { progress, levelProgress, setFlag, reset } = useProgress()
  const { ask } = useConfirm()

  const solvedIn = (ids: readonly string[]) => summarizeProgress(progress.value, ids).solved
  const touched = (ids: readonly string[]) => ids.some(id => progress.value.levels[id] !== undefined)

  /** Opens the level with a fresh session (an open play page restarts in place). */
  async function playAgain(level: Level) {
    restartPlays([level.id])
    await navigateTo(levelPath(level))
  }

  function askResetEntry(place: Pick<LevelPlace, 'number' | 'level'>, onDone?: () => void) {
    const name = placeName(place)
    ask({
      title: t('reset.entry.title', { name }),
      text: t('reset.entry.text', { name }),
      confirmLabel: t('reset.entry.confirm'),
      danger: true,
      onConfirm: () => {
        reset([place.level.id])
        onDone?.()
      }
    })
  }

  function askResetChapter(chapter: Chapter) {
    const ids = chapter.levels.map(level => level.id)
    ask({
      title: t('reset.chapter.title', { chapter: chapter.title }),
      text: t('reset.chapter.text', { solved: t('reset.solved', solvedIn(ids)), chapter: chapter.title }),
      confirmLabel: t('reset.chapter.confirm'),
      danger: true,
      onConfirm: () => reset(ids)
    })
  }

  function askResetTrack(track: Track) {
    const ids = trackLevels(track).map(level => level.id)
    ask({
      title: t('reset.track.title', { track: track.title }),
      text: t('reset.track.text', { solved: t('reset.solved', solvedIn(ids)), track: track.title }),
      confirmLabel: t('reset.track.confirm'),
      danger: true,
      onConfirm: () => reset(ids)
    })
  }

  function askResetAll() {
    const ids = Object.keys(progress.value.levels)
    ask({
      title: t('reset.all.title'),
      text: t('reset.all.text', { solved: t('reset.solved', solvedIn(ids)) }),
      confirmLabel: t('reset.all.confirm'),
      danger: true,
      onConfirm: () => reset(ids)
    })
  }

  /** The entry menu: Play again, Mark "practise again" (a solved entry only), Mark as not solved. */
  function entryItems(place: Pick<LevelPlace, 'number' | 'level'>, options: { onPlayAgain?: () => void, onReset?: () => void } = {}): DropdownMenuItem[][] {
    const entry = levelProgress(place.level.id)
    const solved = entry?.solved === true
    return [
      [
        {
          label: t('menu.entry.playAgain'),
          icon: 'i-lucide-rotate-ccw',
          onSelect: () => options.onPlayAgain ? options.onPlayAgain() : playAgain(place.level)
        },
        {
          label: t('menu.entry.practiseAgain'),
          type: 'checkbox',
          checked: entry?.practiseAgain === true,
          disabled: !solved,
          onUpdateChecked: (checked: boolean) => setFlag(place.level.id, checked)
        }
      ],
      [
        {
          label: t('menu.entry.notSolved'),
          icon: 'i-lucide-circle-x',
          color: 'error',
          disabled: !solved,
          onSelect: () => askResetEntry(place, options.onReset)
        }
      ]
    ]
  }

  /** The chapter menu: Practise again (the first flagged entry), Reset chapter. */
  function chapterItems(chapter: Chapter): DropdownMenuItem[][] {
    const flagged = practiseAgainIn(chapter, progress.value)
    return [
      [{
        label: t('menu.chapter.practise', { chapter: chapter.title }),
        icon: 'i-lucide-flag',
        disabled: !flagged,
        onSelect: () => flagged ? playAgain(flagged) : undefined
      }],
      [{
        label: t('menu.chapter.reset', { chapter: chapter.title }),
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: !touched(chapter.levels.map(level => level.id)),
        onSelect: () => askResetChapter(chapter)
      }]
    ]
  }

  /** The track menu: Reset all <track> progress. */
  function trackItems(track: Track): DropdownMenuItem[][] {
    return [[{
      label: t('menu.track.reset', { track: track.title }),
      icon: 'i-lucide-trash-2',
      color: 'error',
      disabled: !touched(trackLevels(track).map(level => level.id)),
      onSelect: () => askResetTrack(track)
    }]]
  }

  return { playAgain, entryItems, chapterItems, trackItems, askResetAll, askResetEntry }
}

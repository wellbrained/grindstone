// The ⋯ menus around progress (ADR 0006, "Redo, practise again, reset"): per entry (track page row and level page),
// per chapter and per track (track page), and Reset everything (About page). Every reset asks first (useConfirm) and
// says exactly what it clears.
import type { DropdownMenuItem } from '@nuxt/ui'
import { entryOf, placeName, practiseAgainIn, summarizeProgress, trackLevels } from '#shared/levels'
import type { Chapter, Level, LevelPlace, Track } from '#shared/levels'

export function useProgressActions() {
  const { t } = useI18n()
  const { progress, levelProgress, setFlag, reset } = useProgress()
  const { ask } = useConfirm()

  const solvedIn = (ids: readonly string[]) => summarizeProgress(progress.value, ids).solved
  const touched = (ids: readonly string[]) => ids.some(id => entryOf(progress.value, id) !== undefined)

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

  /** Asks before clearing these entries; `names` fills the scope's texts (reset.chapter, reset.track, reset.all). */
  function askResetMany(scope: 'chapter' | 'track' | 'all', ids: readonly string[], names: Record<string, string> = {}) {
    ask({
      title: t(`reset.${scope}.title`, names),
      text: t(`reset.${scope}.text`, { ...names, solved: t('reset.solved', solvedIn(ids)) }),
      confirmLabel: t(`reset.${scope}.confirm`),
      danger: true,
      onConfirm: () => reset(ids)
    })
  }

  const askResetChapter = (chapter: Chapter) => askResetMany('chapter', chapter.levels.map(level => level.id), { chapter: chapter.title })
  const askResetTrack = (track: Track) => askResetMany('track', trackLevels(track).map(level => level.id), { track: track.title })
  const askResetAll = () => askResetMany('all', Object.keys(progress.value.levels))

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

import { cn } from '@/lib/utils'
import type { KanbanBoardSummary } from '@/types/hermes'

interface BoardTab {
  slug: null | string
  label: string
  count: number
  active: boolean
  notify: boolean
}

interface BoardTabsProps {
  boards: KanbanBoardSummary[]
  activeSlug: null | string
  activeTotal: number
  onSelect: (slug: null | string) => void
}

// Side-by-side board tabs replacing the board <select>. Each tab carries a task
// count badge; non-active boards that still hold tasks get a pulsing dot so work
// waiting on another board is visible without opening the dropdown.
// Reads the total task count a board reports via `GET /boards`, tolerating the
// legacy `task_count` field and boards that predate count reporting.
function boardTotal(board: KanbanBoardSummary): number {
  return board.total ?? board.task_count ?? 0
}

export function BoardTabs({ boards, activeSlug, activeTotal, onSelect }: BoardTabsProps) {
  const defaultActive = activeSlug === null
  const defaultBoard = boards.find(board => board.slug === 'default')

  const tabs: BoardTab[] = [
    {
      slug: null,
      label: 'Default',
      count: defaultActive ? activeTotal : defaultBoard ? boardTotal(defaultBoard) : 0,
      active: defaultActive,
      notify: false
    },
    ...boards.map(board => {
      const active = board.slug === activeSlug
      const count = active ? activeTotal : boardTotal(board)

      return {
        slug: board.slug,
        label: board.label || board.slug,
        count,
        active,
        notify: !active && count > 0
      }
    })
  ]

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {tabs.map(tab => (
        <button
          className={cn(
            'relative flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] px-2.5 text-xs transition-colors',
            tab.active
              ? 'bg-(--ui-bg-quaternary) text-(--ui-text-primary) shadow-[inset_0_0_0_1px_var(--ui-accent)]'
              : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)'
          )}
          key={tab.slug ?? '__default__'}
          onClick={() => onSelect(tab.slug)}
          title={tab.label}
          type="button"
        >
          <span className="max-w-[10rem] truncate">{tab.label}</span>

          {tab.count > 0 ? (
            <span
              className={cn(
                'rounded-full px-1.5 text-[0.65rem] leading-4',
                tab.active
                  ? 'bg-(--ui-accent) text-white'
                  : 'bg-(--ui-bg-quaternary) text-(--ui-text-secondary)'
              )}
            >
              {tab.count}
            </span>
          ) : null}

          {tab.notify ? (
            <span className="absolute -right-0.5 -top-0.5 flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-(--ui-accent) opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-(--ui-accent) ring-2 ring-(--ui-chat-surface-background)" />
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

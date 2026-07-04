import { cn } from '@/lib/utils'
import type { KanbanStatus } from '@/types/hermes'

import { KANBAN_COLUMN_LABELS, KANBAN_COLUMNS, KANBAN_DOT_COLOR } from './constants'

interface ColumnOverviewProps {
  counts: Record<KanbanStatus, number>
  offscreen: Set<KanbanStatus>
  onJump: (status: KanbanStatus) => void
}

// Compact one-row map of every column and its task count so nothing hides in the
// horizontal overflow. Columns currently scrolled out of view are ringed; click a
// chip to scroll it into view.
export function ColumnOverview({ counts, offscreen, onJump }: ColumnOverviewProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {KANBAN_COLUMNS.map(status => {
        const count = counts[status] ?? 0
        const hidden = offscreen.has(status)
        const hasTasks = count > 0

        return (
          <button
            className={cn(
              'flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[0.7rem] transition-colors',
              hidden
                ? 'border-(--ui-accent) text-(--ui-text-primary)'
                : 'border-(--ui-stroke-tertiary)',
              hasTasks
                ? 'text-(--ui-text-primary) hover:bg-(--chrome-action-hover)'
                : 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)'
            )}
            key={status}
            onClick={() => onJump(status)}
            title={`Jump to ${KANBAN_COLUMN_LABELS[status]}`}
            type="button"
          >
            <span
              aria-hidden
              className={cn('size-1.5 shrink-0 rounded-full', hasTasks ? '' : 'opacity-40')}
              style={{ background: KANBAN_DOT_COLOR[status] }}
            />
            <span className={cn(hasTasks ? '' : 'opacity-70')}>{KANBAN_COLUMN_LABELS[status]}</span>
            {hasTasks ? (
              <span className="rounded-full bg-(--ui-bg-quaternary) px-1 text-[0.62rem] leading-4 text-(--ui-text-secondary)">
                {count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

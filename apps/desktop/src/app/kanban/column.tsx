import { useDroppable } from '@dnd-kit/core'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'
import type { KanbanStatus, KanbanTask } from '@/types/hermes'

import { KanbanCard } from './card'
import { KANBAN_COLUMN_HELP, KANBAN_COLUMN_LABELS, KANBAN_DOT_COLOR } from './constants'

interface KanbanLane {
  key: string
  label: string
  tasks: KanbanTask[]
}

function groupByAssignee(tasks: KanbanTask[]): KanbanLane[] {
  const order: string[] = []
  const byKey = new Map<string, KanbanTask[]>()

  tasks.forEach(task => {
    const key = task.assignee ?? ''

    if (!byKey.has(key)) {
      byKey.set(key, [])
      order.push(key)
    }

    byKey.get(key)?.push(task)
  })

  return order.map(key => ({ key, label: key || 'unassigned', tasks: byKey.get(key) ?? [] }))
}

interface KanbanColumnProps {
  status: KanbanStatus
  tasks: KanbanTask[]
  now: number
  lanesByProfile: boolean
  onOpenTask: (taskId: string) => void
  onCreate: (status: KanbanStatus, title: string) => void
}

export function KanbanColumn({ status, tasks, now, lanesByProfile, onOpenTask, onCreate }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const [composing, setComposing] = useState(false)
  const [title, setTitle] = useState('')

  const lanes = lanesByProfile ? groupByAssignee(tasks) : null

  function submit() {
    const trimmed = title.trim()

    if (!trimmed) {
      return
    }

    onCreate(status, trimmed)
    setTitle('')
    setComposing(false)
  }

  return (
    <section className="flex h-full w-72 shrink-0 flex-col">
      <header className="flex items-start gap-2 px-1 pb-1.5">
        <span
          aria-hidden
          className="mt-1 size-2 shrink-0 rounded-full"
          style={{ background: KANBAN_DOT_COLOR[status] }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-(--ui-text-primary)">{KANBAN_COLUMN_LABELS[status]}</span>
            <span className="text-[0.7rem] text-(--ui-text-tertiary)">{tasks.length}</span>
            <Button
              aria-label={`Add task to ${KANBAN_COLUMN_LABELS[status]}`}
              className="ml-auto text-(--ui-text-tertiary) hover:text-foreground"
              onClick={() => setComposing(value => !value)}
              size="icon-xs"
              title="Add task here"
              type="button"
              variant="ghost"
            >
              <Codicon name="add" size="0.75rem" />
            </Button>
          </div>
          <p className="mt-0.5 text-[0.68rem] leading-snug text-(--ui-text-tertiary)">
            {KANBAN_COLUMN_HELP[status]}
          </p>
        </div>
      </header>

      {composing ? (
        <form
          className="mb-1.5 px-1"
          onSubmit={event => {
            event.preventDefault()
            submit()
          }}
        >
          <input
            autoFocus
            className="w-full rounded-[6px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-2 py-1.5 text-xs text-(--ui-text-primary) placeholder:text-(--ui-text-tertiary) focus-visible:border-(--ui-accent) focus-visible:outline-none"
            onBlur={() => (title.trim() ? submit() : setComposing(false))}
            onChange={event => setTitle(event.target.value)}
            onKeyDown={event => event.key === 'Escape' && setComposing(false)}
            placeholder={`New ${KANBAN_COLUMN_LABELS[status].toLowerCase()} task…`}
            value={title}
          />
        </form>
      ) : null}

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-[8px] border border-dashed p-1.5 transition-colors',
          isOver ? 'border-(--ui-accent) bg-(--chrome-action-hover)' : 'border-(--ui-stroke-tertiary)'
        )}
        ref={setNodeRef}
      >
        {tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8 text-[0.7rem] text-(--ui-text-tertiary)">
            — no tasks —
          </div>
        ) : lanes ? (
          lanes.map(lane => (
            <div className="flex flex-col gap-1.5" key={lane.key}>
              <span className="px-0.5 text-[0.62rem] uppercase tracking-wide text-(--ui-text-tertiary)">
                {lane.label}
              </span>
              {lane.tasks.map(task => (
                <KanbanCard key={task.id} now={now} onOpen={onOpenTask} task={task} />
              ))}
            </div>
          ))
        ) : (
          tasks.map(task => <KanbanCard key={task.id} now={now} onOpen={onOpenTask} task={task} />)
        )}
      </div>
    </section>
  )
}

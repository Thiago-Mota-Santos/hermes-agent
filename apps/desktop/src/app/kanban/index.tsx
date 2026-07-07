import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import type * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  createKanbanBoard,
  deleteKanbanBoard,
  getKanbanBoard,
  getKanbanOrchestration,
  listKanbanBoards,
  listKanbanProfiles,
  nudgeKanbanDispatcher,
  renameKanbanBoard,
  updateKanbanTask
} from '@/hermes'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import type {
  KanbanBoardResponse,
  KanbanBoardSummary,
  KanbanOrchestration,
  KanbanProfile,
  KanbanStatus,
  KanbanTask
} from '@/types/hermes'

import { PAGE_INSET_X } from '../layout-constants'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

import { BoardTabs } from './board-tabs'
import { KanbanCardContent } from './card'
import { KanbanColumn } from './column'
import { ColumnOverview } from './column-overview'
import { isKanbanColumn, KANBAN_COLUMNS } from './constants'
import { CreateTaskModal } from './create-task'
import { KanbanDetail } from './detail'
import { filterTasksByStatus, moveTaskStatus } from './helpers'
import { OrchestrationSettings } from './orchestration'

const KANBAN_POLL_INTERVAL_MS = 3000

// Horizontal-scroll tuning for the column strip: a column is "off-screen" once
// less than this fraction is visible; the edge arrows nudge by roughly one column.
const COLUMN_VISIBLE_RATIO = 0.5
const COLUMN_SCROLL_STEP = 320
const COLUMN_SCROLL_MARGIN = 8

const CONTROL_CLASS =
  'h-7 rounded-[6px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-2 text-xs text-(--ui-text-primary) focus-visible:border-(--ui-accent) focus-visible:outline-none'

function isSameStatusSet(a: Set<KanbanStatus>, b: Set<KanbanStatus>): boolean {
  if (a.size !== b.size) {
    return false
  }

  for (const value of a) {
    if (!b.has(value)) {
      return false
    }
  }

  return true
}

interface KanbanViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

export function KanbanView({ setStatusbarItemGroup: _setStatusbarItemGroup, className, ...props }: KanbanViewProps) {
  const [board, setBoard] = useState<KanbanBoardResponse | null>(null)
  const [boards, setBoards] = useState<KanbanBoardSummary[]>([])
  const [boardSlug, setBoardSlug] = useState<null | string>(null)
  const [orchestration, setOrchestration] = useState<KanbanOrchestration | null>(null)
  const [profiles, setProfiles] = useState<KanbanProfile[]>([])
  const [showOrchestration, setShowOrchestration] = useState(false)
  const [query, setQuery] = useState('')
  const [tenant, setTenant] = useState<null | string>(null)
  const [assignee, setAssignee] = useState<null | string>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [lanesByProfile, setLanesByProfile] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<null | string>(null)
  const [createStatus, setCreateStatus] = useState<KanbanStatus | null>(null)
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null)
  const [creatingBoard, setCreatingBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const lastEventId = useRef(-1)
  const busy = useRef(false)

  const load = useCallback(
    async (force: boolean) => {
      try {
        const next = await getKanbanBoard({ board: boardSlug, includeArchived: showArchived })

        if (force || next.latest_event_id !== lastEventId.current) {
          lastEventId.current = next.latest_event_id
          setBoard(next)
        }
      } catch (err) {
        notifyError(err, 'Failed to load the Kanban board')
      }
    },
    [boardSlug, showArchived]
  )

  const refresh = useCallback(async () => {
    setRefreshing(true)

    try {
      const [, nextBoards, nextOrchestration, nextProfiles] = await Promise.all([
        load(true),
        listKanbanBoards().catch(() => null),
        getKanbanOrchestration().catch(() => null),
        listKanbanProfiles().catch(() => null)
      ])

      if (nextBoards) {
        setBoards(nextBoards.boards)
      }

      if (nextOrchestration) {
        setOrchestration(nextOrchestration)
      }

      if (nextProfiles) {
        setProfiles(nextProfiles.profiles)
      }
    } finally {
      setRefreshing(false)
    }
  }, [load])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const timer = setInterval(() => {
      if (busy.current || activeTask) {
        return
      }

      void load(false)
    }, KANBAN_POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [load, activeTask])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const grouped = useMemo(() => {
    if (!board) {
      return null
    }

    return filterTasksByStatus({ board, query, assignee, tenant })
  }, [board, query, assignee, tenant])

  const totalTasks = useMemo(
    () => (board ? board.columns.reduce((sum, column) => sum + column.tasks.length, 0) : 0),
    [board]
  )

  const columnCounts = useMemo(() => {
    const counts = {} as Record<KanbanStatus, number>

    KANBAN_COLUMNS.forEach(status => {
      counts[status] = grouped?.[status]?.length ?? 0
    })

    return counts
  }, [grouped])

  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false })
  const [offscreen, setOffscreen] = useState<Set<KanbanStatus>>(new Set())

  const measureScroll = useCallback(() => {
    const el = scrollRef.current

    if (!el) {
      return
    }

    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1

    setScrollEdges(prev => (prev.left === left && prev.right === right ? prev : { left, right }))

    const elRect = el.getBoundingClientRect()
    const hidden = new Set<KanbanStatus>()

    el.querySelectorAll<HTMLElement>('[data-column]').forEach(node => {
      const rect = node.getBoundingClientRect()
      const visible = Math.min(rect.right, elRect.right) - Math.max(rect.left, elRect.left)

      if (visible < rect.width * COLUMN_VISIBLE_RATIO) {
        hidden.add(node.dataset.column as KanbanStatus)
      }
    })

    setOffscreen(prev => (isSameStatusSet(prev, hidden) ? prev : hidden))
  }, [])

  useEffect(() => {
    const el = scrollRef.current

    if (!board || !el) {
      return
    }

    measureScroll()

    el.addEventListener('scroll', measureScroll, { passive: true })

    const observer = new ResizeObserver(measureScroll)

    observer.observe(el)

    return () => {
      el.removeEventListener('scroll', measureScroll)
      observer.disconnect()
    }
  }, [measureScroll, board])

  const scrollColumns = useCallback((direction: number) => {
    scrollRef.current?.scrollBy({ left: direction * COLUMN_SCROLL_STEP, behavior: 'smooth' })
  }, [])

  const scrollToColumn = useCallback((status: KanbanStatus) => {
    const el = scrollRef.current
    const node = el?.querySelector<HTMLElement>(`[data-column="${status}"]`)

    if (el && node) {
      const delta = node.getBoundingClientRect().left - el.getBoundingClientRect().left - COLUMN_SCROLL_MARGIN

      el.scrollBy({ left: delta, behavior: 'smooth' })
    }
  }, [])

  const hasFilters = Boolean(query || tenant || assignee)

  function handleDragStart(event: DragStartEvent) {
    const task = board?.columns.flatMap(column => column.tasks).find(item => item.id === event.active.id)

    setActiveTask(task ?? null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null)

    const overId = event.over?.id

    if (!board || typeof overId !== 'string' || !isKanbanColumn(overId)) {
      return
    }

    const taskId = String(event.active.id)
    const current = board.columns.flatMap(column => column.tasks).find(task => task.id === taskId)

    if (!current || current.status === overId) {
      return
    }

    busy.current = true
    setBoard(moveTaskStatus({ board, taskId, toStatus: overId }))

    try {
      await updateKanbanTask(taskId, { status: overId }, boardSlug)
      await load(true)
    } catch (err) {
      notifyError(err, 'Failed to move task')
      await load(true)
    } finally {
      busy.current = false
    }
  }


  async function handleCreateBoard() {
    const label = newBoardName.trim()
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

    if (!slug) {
      return
    }

    busy.current = true

    try {
      await createKanbanBoard(slug, label)
      setNewBoardName('')
      setCreatingBoard(false)
      setBoardSlug(slug)
      notify({ kind: 'success', title: 'Board created', message: label })
      await refresh()
    } catch (err) {
      notifyError(err, 'Failed to create board')
    } finally {
      busy.current = false
    }
  }

  async function handleNudge() {
    try {
      await nudgeKanbanDispatcher(boardSlug)
      notify({ kind: 'success', title: 'Dispatcher nudged', message: 'Ran one dispatch cycle' })
      await load(true)
    } catch (err) {
      notifyError(err, 'Failed to nudge dispatcher')
    }
  }

  function clearFilters() {
    setQuery('')
    setTenant(null)
    setAssignee(null)
  }

  const orchestrationLabel = orchestration?.auto_decompose ? 'Auto' : 'Manual'

  return (
    <section
      {...props}
      className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)', className)}
    >
      <div className={cn('shrink-0 pt-[calc(var(--titlebar-height)+0.5rem)]', PAGE_INSET_X)}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-2">
          <span className="text-[0.7rem] uppercase tracking-wide text-(--ui-text-tertiary)">Board</span>
          <BoardTabs
            activeSlug={boardSlug}
            activeTotal={totalTasks}
            boards={boards}
            onSelect={setBoardSlug}
          />
          <span className="text-xs text-(--ui-text-tertiary)">
            {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
          </span>

          {orchestration ? (
            <button
              className="rounded-full border border-(--ui-stroke-tertiary) px-2 py-0.5 text-[0.7rem] text-(--ui-text-secondary) hover:text-foreground"
              onClick={() => setShowOrchestration(true)}
              title="Orchestration settings"
              type="button"
            >
              Orchestration: {orchestrationLabel}
            </button>
          ) : null}

          {boardSlug ? (
            <>
              <Button
                onClick={() => {
                  const name = window.prompt('Rename board', boardSlug)

                  if (name?.trim()) {
                    void renameKanbanBoard(boardSlug, name.trim()).then(() => void refresh())
                  }
                }}
                size="icon-xs"
                title="Rename board"
                type="button"
                variant="ghost"
              >
                <Codicon name="edit" size="0.8rem" />
              </Button>
              <Button
                onClick={() => {
                  if (window.confirm(`Archive board "${boardSlug}"?`)) {
                    void deleteKanbanBoard(boardSlug).then(() => {
                      setBoardSlug(null)
                      void refresh()
                    })
                  }
                }}
                size="icon-xs"
                title="Archive board"
                type="button"
                variant="ghost"
              >
                <Codicon name="trash" size="0.8rem" />
              </Button>
            </>
          ) : null}

          {creatingBoard ? (
            <form
              className="ml-auto flex items-center gap-1.5"
              onSubmit={event => {
                event.preventDefault()
                void handleCreateBoard()
              }}
            >
              <input
                autoFocus
                className={CONTROL_CLASS}
                onChange={event => setNewBoardName(event.target.value)}
                onKeyDown={event => event.key === 'Escape' && setCreatingBoard(false)}
                placeholder="Board name…"
                value={newBoardName}
              />
              <Button disabled={!newBoardName.trim()} size="sm" type="submit" variant="secondary">
                Create
              </Button>
            </form>
          ) : (
            <Button
              className="ml-auto"
              onClick={() => setCreatingBoard(true)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Codicon name="add" size="0.875rem" /> New board
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-(--ui-stroke-tertiary) py-2">
          <div className="flex items-center gap-1.5">
            <Codicon className="text-(--ui-text-tertiary)" name="search" size="0.8rem" />
            <input
              className={cn(CONTROL_CLASS, 'w-44')}
              onChange={event => setQuery(event.target.value)}
              placeholder="Filter cards…"
              value={query}
            />
          </div>

          <select className={CONTROL_CLASS} onChange={event => setTenant(event.target.value || null)} value={tenant ?? ''}>
            <option value="">All tenants</option>
            {board?.tenants.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            className={CONTROL_CLASS}
            onChange={event => setAssignee(event.target.value || null)}
            value={assignee ?? ''}
          >
            <option value="">All profiles</option>
            {board?.assignees.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 text-xs text-(--ui-text-secondary)">
            <input
              checked={showArchived}
              className="accent-current"
              onChange={event => setShowArchived(event.target.checked)}
              type="checkbox"
            />
            Show archived
          </label>

          <label className="flex items-center gap-1.5 text-xs text-(--ui-text-secondary)">
            <input
              checked={lanesByProfile}
              className="accent-current"
              onChange={event => setLanesByProfile(event.target.checked)}
              type="checkbox"
            />
            Lanes by profile
          </label>

          <div className="ml-auto flex items-center gap-1.5">
            <Button onClick={() => void handleNudge()} size="sm" type="button" variant="secondary">
              Nudge dispatcher
            </Button>
            <Button disabled={refreshing} onClick={() => void refresh()} size="sm" type="button" variant="secondary">
              <Codicon name="refresh" size="0.8rem" spinning={refreshing} /> Refresh
            </Button>
            <Button disabled={!hasFilters} onClick={clearFilters} size="sm" type="button" variant="ghost">
              Clear filters
            </Button>
          </div>
        </div>
      </div>

      {!board || !grouped ? (
        <PageLoader />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className={cn('shrink-0', PAGE_INSET_X)}>
              <ColumnOverview counts={columnCounts} offscreen={offscreen} onJump={scrollToColumn} />
            </div>

            <div className="relative flex min-h-0 min-w-0 flex-1">
              <DndContext
                onDragEnd={event => void handleDragEnd(event)}
                onDragStart={handleDragStart}
                sensors={sensors}
              >
                <div
                  className={cn('flex min-h-0 flex-1 gap-3 overflow-x-auto pb-3 pt-2', PAGE_INSET_X)}
                  ref={scrollRef}
                >
                  {KANBAN_COLUMNS.map(status => (
                    <div className="flex h-full shrink-0" data-column={status} key={status}>
                      <KanbanColumn
                        lanesByProfile={lanesByProfile}
                        now={board.now}
                        onOpenTask={setSelectedTaskId}
                        onRequestCreate={setCreateStatus}
                        status={status}
                        tasks={grouped[status] ?? []}
                      />
                    </div>
                  ))}
                </div>

                <DragOverlay>
                  {activeTask ? (
                    <div className="w-72">
                      <KanbanCardContent dragging now={board.now} task={activeTask} />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>

              {scrollEdges.left ? (
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center">
                  <div className="pointer-events-none h-full w-12 bg-gradient-to-r from-(--ui-chat-surface-background) to-transparent" />
                  <button
                    aria-label="Scroll columns left"
                    className="pointer-events-auto absolute left-1.5 flex size-7 items-center justify-center rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) text-(--ui-text-secondary) shadow-sm transition-colors hover:text-(--ui-text-primary)"
                    onClick={() => scrollColumns(-1)}
                    type="button"
                  >
                    <Codicon name="chevron-left" size="0.9rem" />
                  </button>
                </div>
              ) : null}

              {scrollEdges.right ? (
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end">
                  <div className="pointer-events-none h-full w-12 bg-gradient-to-l from-(--ui-chat-surface-background) to-transparent" />
                  <button
                    aria-label="Scroll columns right"
                    className="pointer-events-auto absolute right-1.5 flex size-7 items-center justify-center rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) text-(--ui-text-secondary) shadow-sm transition-colors hover:text-(--ui-text-primary)"
                    onClick={() => scrollColumns(1)}
                    type="button"
                  >
                    <Codicon name="chevron-right" size="0.9rem" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {selectedTaskId ? (
            <KanbanDetail
              board={boardSlug}
              now={board.now}
              onChanged={() => void load(true)}
              onClose={() => setSelectedTaskId(null)}
              profiles={profiles}
              taskId={selectedTaskId}
            />
          ) : null}
        </div>
      )}

      {showOrchestration && orchestration ? (
        <OrchestrationSettings
          current={orchestration}
          onClose={() => setShowOrchestration(false)}
          onSaved={() => void refresh()}
          profiles={profiles}
        />
      ) : null}

      {createStatus ? (
        <CreateTaskModal
          board={boardSlug}
          defaultAssignee={orchestration?.default_assignee}
          onClose={() => setCreateStatus(null)}
          onCreated={() => void load(true)}
          profiles={profiles}
          status={createStatus}
        />
      ) : null}
    </section>
  )
}

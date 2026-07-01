import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  addKanbanComment,
  decomposeKanbanTask,
  deleteKanbanTask,
  getKanbanTask,
  getKanbanTaskLog,
  reassignKanbanTask,
  reclaimKanbanTask,
  specifyKanbanTask,
  updateKanbanTask
} from '@/hermes'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import type { KanbanProfile, KanbanStatus, KanbanTaskDetail } from '@/types/hermes'

import { KANBAN_COLUMN_LABELS, KANBAN_COLUMNS } from './constants'
import { formatAge } from './helpers'

const STATUS_OPTIONS: KanbanStatus[] = [...KANBAN_COLUMNS, 'archived']

const CONTROL =
  'h-7 rounded-[6px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-2 text-xs text-(--ui-text-primary) focus-visible:border-(--ui-accent) focus-visible:outline-none'

interface KanbanDetailProps {
  taskId: string
  board: null | string
  profiles: KanbanProfile[]
  now: number
  onClose: () => void
  onChanged: () => void
}

export function KanbanDetail({ taskId, board, profiles, now, onClose, onChanged }: KanbanDetailProps) {
  const [detail, setDetail] = useState<KanbanTaskDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [bodyDraft, setBodyDraft] = useState('')
  const [comment, setComment] = useState('')
  const [log, setLog] = useState<null | string>(null)
  const logRef = useRef<HTMLPreElement>(null)

  const reload = useCallback(async () => {
    try {
      const next = await getKanbanTask(taskId, board)

      setDetail(next)
      setTitleDraft(next.task.title)
      setBodyDraft(next.task.body ?? '')
    } catch (err) {
      notifyError(err, 'Failed to load task')
    }
  }, [taskId, board])

  useEffect(() => {
    void reload()
  }, [reload])

  const run = useCallback(
    async (action: () => Promise<unknown>, successMessage: string) => {
      setBusy(true)

      try {
        await action()
        notify({ kind: 'success', title: successMessage, message: taskId })
        await reload()
        onChanged()
      } catch (err) {
        notifyError(err, 'Action failed')
      } finally {
        setBusy(false)
      }
    },
    [taskId, reload, onChanged]
  )

  const status = detail?.task.status

  useEffect(() => {
    if (status !== 'running') {
      return
    }

    let cancelled = false

    const tick = async () => {
      try {
        const result = await getKanbanTaskLog(taskId, 20_000, board)

        if (!cancelled) {
          setLog(result.content || '(no output yet)')
        }
      } catch {
        // transient — keep the last log and retry on the next tick
      }
    }

    void tick()

    const timer = setInterval(() => void tick(), 2000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [status, taskId, board])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  if (!detail) {
    return (
      <aside className="shadow-nous flex h-full w-[26rem] shrink-0 items-center justify-center border-l border-(--stroke-nous) bg-(--ui-chat-surface-background)">
        <Codicon name="loading" size="1.25rem" spinning />
      </aside>
    )
  }

  const task = detail.task
  const isTriage = task.status === 'triage'
  const isRunning = task.status === 'running'

  async function viewLog() {
    try {
      const result = await getKanbanTaskLog(taskId, 20_000, board)

      setLog(result.content || '(empty log)')
    } catch (err) {
      notifyError(err, 'Failed to read log')
    }
  }

  return (
    <aside className="shadow-nous flex h-full w-[26rem] shrink-0 flex-col border-l border-(--stroke-nous) bg-(--ui-chat-surface-background)">
      <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{KANBAN_COLUMN_LABELS[task.status]}</Badge>
          <span className="font-mono text-[0.62rem] text-(--ui-text-tertiary)">{task.id}</span>
        </div>
        <Button aria-label="Close" onClick={onClose} size="icon-xs" title="Close" type="button" variant="ghost">
          <Codicon name="close" size="0.875rem" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <input
          className={cn(CONTROL, 'h-auto py-1.5 text-sm')}
          onBlur={() => titleDraft.trim() && titleDraft !== task.title && void run(() => updateKanbanTask(taskId, { title: titleDraft.trim() }, board), 'Title updated')}
          onChange={event => setTitleDraft(event.target.value)}
          value={titleDraft}
        />

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[0.62rem] uppercase tracking-wide text-(--ui-text-tertiary)">
            Status
            <select
              className={CONTROL}
              disabled={busy}
              onChange={event => void run(() => updateKanbanTask(taskId, { status: event.target.value as KanbanStatus }, board), 'Status updated')}
              value={task.status}
            >
              {STATUS_OPTIONS.map(status => (
                <option key={status} value={status}>
                  {KANBAN_COLUMN_LABELS[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[0.62rem] uppercase tracking-wide text-(--ui-text-tertiary)">
            Assignee
            <select
              className={CONTROL}
              disabled={busy}
              onChange={event => void run(() => reassignKanbanTask(taskId, event.target.value || null, board), 'Reassigned')}
              value={task.assignee ?? ''}
            >
              <option value="">unassigned</option>
              {profiles.map(profile => (
                <option key={profile.name} value={profile.name}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[0.62rem] uppercase tracking-wide text-(--ui-text-tertiary)">
            Priority
            <input
              className={CONTROL}
              defaultValue={task.priority}
              disabled={busy}
              onBlur={event => Number(event.target.value) !== task.priority && void run(() => updateKanbanTask(taskId, { priority: Number(event.target.value) || 0 }, board), 'Priority updated')}
              type="number"
            />
          </label>

          <div className="flex flex-col gap-1 text-[0.62rem] uppercase tracking-wide text-(--ui-text-tertiary)">
            Age
            <span className="flex h-7 items-center text-xs text-(--ui-text-secondary)">
              {formatAge(task.created_at, now) || '—'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button disabled={busy} onClick={() => void run(() => updateKanbanTask(taskId, { status: 'ready' }, board), 'Promoted')} size="xs" type="button" variant="secondary">
            Promote to ready
          </Button>
          <Button disabled={busy} onClick={() => void run(() => updateKanbanTask(taskId, { status: 'done' }, board), 'Completed')} size="xs" type="button" variant="secondary">
            Mark done
          </Button>
          {isRunning ? (
            <Button disabled={busy} onClick={() => void run(() => reclaimKanbanTask(taskId, board), 'Reclaimed')} size="xs" type="button" variant="secondary">
              Reclaim
            </Button>
          ) : null}
          {isTriage ? (
            <>
              <Button disabled={busy} onClick={() => void run(() => specifyKanbanTask(taskId, board), 'Specified')} size="xs" type="button" variant="secondary">
                Specify
              </Button>
              <Button disabled={busy} onClick={() => void run(() => decomposeKanbanTask(taskId, board), 'Decomposed')} size="xs" type="button" variant="secondary">
                Decompose
              </Button>
            </>
          ) : null}
          <Button disabled={busy} onClick={() => void run(() => deleteKanbanTask(taskId, board).then(onClose), 'Deleted')} size="xs" type="button" variant="destructive">
            Delete
          </Button>
        </div>

        <label className="flex flex-col gap-1 text-[0.62rem] uppercase tracking-wide text-(--ui-text-tertiary)">
          Description
          <textarea
            className={cn(CONTROL, 'h-24 resize-none py-1.5 leading-relaxed')}
            onBlur={() => bodyDraft !== (task.body ?? '') && void run(() => updateKanbanTask(taskId, { body: bodyDraft }, board), 'Description updated')}
            onChange={event => setBodyDraft(event.target.value)}
            placeholder="Describe the task so a worker can execute it…"
            value={bodyDraft}
          />
        </label>

        {task.latest_summary ? (
          <div className="flex flex-col gap-1">
            <span className="text-[0.62rem] font-medium uppercase tracking-wide text-(--ui-text-tertiary)">
              Latest handoff
            </span>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-(--ui-text-secondary)">
              {task.latest_summary}
            </p>
          </div>
        ) : null}

        {detail.runs.length > 0 || isRunning ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[0.62rem] font-medium uppercase tracking-wide text-(--ui-text-tertiary)">
                Worker activity
                {isRunning ? (
                  <Badge variant="default">
                    <Codicon name="pulse" /> live
                  </Badge>
                ) : null}
              </span>
              {!isRunning ? (
                <Button onClick={() => void viewLog()} size="xs" type="button" variant="text">
                  View log
                </Button>
              ) : null}
            </div>
            {detail.runs.slice(0, 4).map(runItem => (
              <div className="flex items-center gap-2 text-[0.68rem] text-(--ui-text-secondary)" key={runItem.id}>
                <Badge variant={runItem.outcome === 'completed' ? 'default' : 'muted'}>
                  {runItem.outcome || runItem.status}
                </Badge>
                <span className="truncate">{runItem.summary || runItem.error || runItem.profile || '—'}</span>
              </div>
            ))}
            {log !== null ? (
              <pre
                className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-[6px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) p-2 font-mono text-[0.62rem] leading-snug text-(--ui-text-secondary)"
                ref={logRef}
              >
                {log}
              </pre>
            ) : isRunning ? (
              <span className="text-[0.68rem] text-(--ui-text-tertiary)">Streaming worker output…</span>
            ) : null}
          </div>
        ) : null}

        {detail.links.parents.length > 0 || detail.links.children.length > 0 ? (
          <div className="flex flex-col gap-1 text-[0.68rem] text-(--ui-text-secondary)">
            <span className="text-[0.62rem] font-medium uppercase tracking-wide text-(--ui-text-tertiary)">
              Dependencies
            </span>
            {detail.links.parents.map(link => (
              <span key={link.id}>↑ {link.title || link.id}</span>
            ))}
            {detail.links.children.map(link => (
              <span key={link.id}>↓ {link.title || link.id}</span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <span className="text-[0.62rem] font-medium uppercase tracking-wide text-(--ui-text-tertiary)">
            Comments ({detail.comments.length})
          </span>
          {detail.comments.map(item => (
            <div className="flex flex-col gap-0.5 rounded-[6px] bg-(--ui-bg-quaternary) px-2 py-1.5" key={item.id}>
              <span className="text-[0.6rem] text-(--ui-text-tertiary)">{item.author}</span>
              <span className="whitespace-pre-wrap text-xs text-(--ui-text-secondary)">{item.body}</span>
            </div>
          ))}
          <form
            className="flex items-center gap-1.5"
            onSubmit={event => {
              event.preventDefault()

              if (comment.trim()) {
                void run(() => addKanbanComment(taskId, comment.trim(), board).then(() => setComment('')), 'Comment added')
              }
            }}
          >
            <input
              className={cn(CONTROL, 'flex-1')}
              onChange={event => setComment(event.target.value)}
              placeholder="Add a comment…"
              value={comment}
            />
            <Button disabled={busy || !comment.trim()} size="xs" type="submit" variant="secondary">
              Send
            </Button>
          </form>
        </div>
      </div>
    </aside>
  )
}

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { createKanbanTask, updateKanbanTask } from '@/hermes'
import { notify, notifyError } from '@/store/notifications'
import type { KanbanProfile, KanbanStatus } from '@/types/hermes'

import { KANBAN_COLUMN_LABELS } from './constants'

const CONTROL =
  'rounded-[6px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-2 py-1.5 text-xs text-(--ui-text-primary) placeholder:text-(--ui-text-tertiary) focus-visible:border-(--ui-accent) focus-visible:outline-none'

interface CreateTaskModalProps {
  status: KanbanStatus
  board: null | string
  profiles: KanbanProfile[]
  defaultAssignee?: null | string
  onClose: () => void
  onCreated: () => void
}

export function CreateTaskModal({ status, board, profiles, defaultAssignee, onClose, onCreated }: CreateTaskModalProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [assignee, setAssignee] = useState(defaultAssignee ?? '')
  const [priority, setPriority] = useState(0)
  const [workspace, setWorkspace] = useState('scratch')
  const [goalMode, setGoalMode] = useState(true)
  const [goalMaxTurns, setGoalMaxTurns] = useState(300)
  const [saving, setSaving] = useState(false)

  async function create() {
    const trimmed = title.trim()

    if (!trimmed) {
      return
    }

    setSaving(true)

    try {
      const created = await createKanbanTask(
        {
          title: trimmed,
          body: body.trim() || undefined,
          assignee: assignee || undefined,
          priority,
          workspace_kind: workspace,
          triage: status === 'triage',
          goal_mode: goalMode,
          goal_max_turns: goalMode ? goalMaxTurns : undefined
        },
        board
      )

      if (status !== 'triage' && created.task?.id) {
        await updateKanbanTask(created.task.id, { status }, board)
      }

      notify({ kind: 'success', title: 'Task created', message: trimmed })
      onCreated()
      onClose()
    } catch (err) {
      notifyError(err, 'Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="shadow-nous flex w-[26rem] flex-col gap-3 rounded-[10px] border border-(--stroke-nous) bg-(--ui-chat-surface-background) p-4"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-(--ui-text-primary)">
            New task · {KANBAN_COLUMN_LABELS[status]}
          </h2>
          <Button aria-label="Close" onClick={onClose} size="icon-xs" title="Close" type="button" variant="ghost">
            <Codicon name="close" size="0.875rem" />
          </Button>
        </div>

        <input
          autoFocus
          className={CONTROL}
          onChange={event => setTitle(event.target.value)}
          onKeyDown={event => event.key === 'Enter' && !event.shiftKey && void create()}
          placeholder="Title"
          value={title}
        />

        <textarea
          className={`${CONTROL} h-28 resize-none leading-relaxed`}
          onChange={event => setBody(event.target.value)}
          placeholder="Description — what should a worker do? (the spec the worker reads)"
          value={body}
        />

        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-[0.62rem] uppercase tracking-wide text-(--ui-text-tertiary)">
            Assignee
            <select className={CONTROL} onChange={event => setAssignee(event.target.value)} value={assignee}>
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
              onChange={event => setPriority(Number(event.target.value) || 0)}
              type="number"
              value={priority}
            />
          </label>

          <label className="flex flex-col gap-1 text-[0.62rem] uppercase tracking-wide text-(--ui-text-tertiary)">
            Workspace
            <select className={CONTROL} onChange={event => setWorkspace(event.target.value)} value={workspace}>
              <option value="scratch">scratch</option>
              <option value="worktree">worktree</option>
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-2 rounded-[6px] border border-(--ui-stroke-tertiary) p-2">
          <label className="flex items-center gap-2 text-xs text-(--ui-text-secondary)">
            <input
              checked={goalMode}
              className="accent-current"
              onChange={event => setGoalMode(event.target.checked)}
              type="checkbox"
            />
            Run until done (goal mode)
          </label>
          <p className="text-[0.62rem] leading-snug text-(--ui-text-tertiary)">
            Loops the worker across turns — a judge re-checks each turn and keeps going until the task is complete,
            instead of stopping at the per-run iteration cap.
          </p>
          {goalMode ? (
            <label className="flex items-center justify-between gap-2 text-[0.62rem] uppercase tracking-wide text-(--ui-text-tertiary)">
              Max turns
              <input
                className={`${CONTROL} w-24`}
                onChange={event => setGoalMaxTurns(Number(event.target.value) || 0)}
                type="number"
                value={goalMaxTurns}
              />
            </label>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose} size="sm" type="button" variant="text">
            Cancel
          </Button>
          <Button disabled={saving || !title.trim()} onClick={() => void create()} size="sm" type="button" variant="secondary">
            Create task
          </Button>
        </div>
      </div>
    </div>
  )
}

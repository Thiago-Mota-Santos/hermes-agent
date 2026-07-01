import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { updateKanbanOrchestration } from '@/hermes'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import type { KanbanOrchestration, KanbanProfile } from '@/types/hermes'

const CONTROL =
  'h-7 rounded-[6px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-2 text-xs text-(--ui-text-primary) focus-visible:border-(--ui-accent) focus-visible:outline-none'

interface OrchestrationSettingsProps {
  current: KanbanOrchestration
  profiles: KanbanProfile[]
  onClose: () => void
  onSaved: () => void
}

export function OrchestrationSettings({ current, profiles, onClose, onSaved }: OrchestrationSettingsProps) {
  const [orchestrator, setOrchestrator] = useState(current.orchestrator_profile ?? '')
  const [defaultAssignee, setDefaultAssignee] = useState(current.default_assignee ?? '')
  const [autoDecompose, setAutoDecompose] = useState(Boolean(current.auto_decompose))
  const [autoPromote, setAutoPromote] = useState(Boolean(current.auto_promote_children))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)

    try {
      await updateKanbanOrchestration({
        orchestrator_profile: orchestrator || null,
        default_assignee: defaultAssignee || null,
        auto_decompose: autoDecompose,
        auto_promote_children: autoPromote
      })
      notify({ kind: 'success', title: 'Orchestration saved', message: autoDecompose ? 'Auto' : 'Manual' })
      onSaved()
      onClose()
    } catch (err) {
      notifyError(err, 'Failed to save orchestration')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="shadow-nous flex w-96 flex-col gap-4 rounded-[10px] border border-(--stroke-nous) bg-(--ui-chat-surface-background) p-4"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-(--ui-text-primary)">Orchestration settings</h2>
          <Button aria-label="Close" onClick={onClose} size="icon-xs" title="Close" type="button" variant="ghost">
            <Codicon name="close" size="0.875rem" />
          </Button>
        </div>

        <label className="flex flex-col gap-1 text-[0.62rem] uppercase tracking-wide text-(--ui-text-tertiary)">
          Orchestrator profile
          <select className={CONTROL} onChange={event => setOrchestrator(event.target.value)} value={orchestrator}>
            <option value="">none</option>
            {profiles.map(profile => (
              <option key={profile.name} value={profile.name}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[0.62rem] uppercase tracking-wide text-(--ui-text-tertiary)">
          Default assignee
          <select
            className={CONTROL}
            onChange={event => setDefaultAssignee(event.target.value)}
            value={defaultAssignee}
          >
            <option value="">none</option>
            {profiles.map(profile => (
              <option key={profile.name} value={profile.name}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-(--ui-text-secondary)">
          <input
            checked={autoDecompose}
            className="accent-current"
            onChange={event => setAutoDecompose(event.target.checked)}
            type="checkbox"
          />
          Auto-decompose triage tasks
        </label>

        <label className="flex items-center gap-2 text-xs text-(--ui-text-secondary)">
          <input
            checked={autoPromote}
            className="accent-current"
            onChange={event => setAutoPromote(event.target.checked)}
            type="checkbox"
          />
          Auto-promote children when parents complete
        </label>

        <div className={cn('flex justify-end gap-2')}>
          <Button onClick={onClose} size="sm" type="button" variant="text">
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()} size="sm" type="button" variant="secondary">
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

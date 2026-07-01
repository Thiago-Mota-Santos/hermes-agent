import type { KanbanStatus } from '@/types/hermes'

// Column order mirrors the backend dashboard (`BOARD_COLUMNS` in the kanban
// plugin). "archived" is intentionally excluded — it is a filter, not a column.
export const KANBAN_COLUMNS: KanbanStatus[] = [
  'triage',
  'todo',
  'scheduled',
  'ready',
  'running',
  'blocked',
  'review',
  'done'
]

export const KANBAN_COLUMN_LABELS: Record<KanbanStatus, string> = {
  archived: 'Archived',
  blocked: 'Blocked',
  done: 'Done',
  ready: 'Ready',
  review: 'Review',
  running: 'In Progress',
  scheduled: 'Scheduled',
  todo: 'Todo',
  triage: 'Triage'
}

// Column help text — mirrors the kanban plugin dashboard's FALLBACK_COLUMN_HELP.
export const KANBAN_COLUMN_HELP: Record<KanbanStatus, string> = {
  archived: 'Archived tasks are hidden by default',
  blocked: 'Worker asked for human input',
  done: 'Completed',
  ready: 'Dependencies satisfied; assign a profile to dispatch',
  review: 'Needs review before it can be marked done',
  running: 'Claimed by a worker — in-flight',
  scheduled: 'Waiting on a known time delay or scheduled follow-up',
  todo: 'Waiting on dependencies or unassigned',
  triage: 'Raw ideas — a specifier will flesh out the spec'
}

// Status dot colors — mirrors the plugin's `hermes-kanban-dot-*` classes.
export const KANBAN_DOT_COLOR: Record<KanbanStatus, string> = {
  archived: 'var(--ui-stroke-secondary)',
  blocked: '#d14a4a',
  done: '#4a8cd1',
  ready: '#d4b348',
  review: '#d1894a',
  running: '#3fb97d',
  scheduled: 'var(--ui-text-tertiary)',
  todo: 'var(--ui-text-tertiary)',
  triage: '#b47dd6'
}

const KANBAN_COLUMN_SET: ReadonlySet<string> = new Set(KANBAN_COLUMNS)

export function isKanbanColumn(value: string): value is KanbanStatus {
  return KANBAN_COLUMN_SET.has(value)
}

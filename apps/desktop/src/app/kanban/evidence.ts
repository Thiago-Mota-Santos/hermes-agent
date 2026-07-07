import type { KanbanTaskDetail } from '@/types/hermes'

export type EvidenceKind = 'image' | 'video'

export interface EvidenceItem {
  url: string
  kind: EvidenceKind
  source: string
  label: string
}

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v']
const MEDIA_EXTENSION_PATTERN = 'png|jpe?g|gif|webp|avif|svg|mp4|webm|mov|m4v'

// Markdown image/link `![alt](url)` / `[alt](url)` — group 1 is the alt text,
// group 2 the URL. Bare media URLs are matched separately by file extension.
const MARKDOWN_MEDIA = /!?\[([^\]]*)\]\((https?:\/\/[^\s)]+?)\)/g

const BARE_MEDIA = new RegExp(
  `https?:\\/\\/[^\\s)\\]<>"']+\\.(?:${MEDIA_EXTENSION_PATTERN})(?:\\?[^\\s)\\]<>"']*)?`,
  'gi'
)

const MEDIA_EXTENSION = new RegExp(`\\.(?:${MEDIA_EXTENSION_PATTERN})$`, 'i')

function baseUrl(url: string): string {
  return url.split('?')[0].split('#')[0]
}

function isMediaUrl(url: string): boolean {
  return MEDIA_EXTENSION.test(baseUrl(url))
}

function kindOf(url: string): EvidenceKind {
  const clean = baseUrl(url)
  const extension = clean.slice(clean.lastIndexOf('.') + 1).toLowerCase()

  return VIDEO_EXTENSIONS.includes(extension) ? 'video' : 'image'
}

function labelOf(url: string, alt: string): string {
  return alt.trim() || baseUrl(url).split('/').pop() || url
}

function scanText(text: string, source: string): EvidenceItem[] {
  if (!text) {
    return []
  }

  const fromMarkdown = [...text.matchAll(MARKDOWN_MEDIA)]
    .filter(match => isMediaUrl(match[2]))
    .map(match => ({ url: match[2], alt: match[1] }))

  const markdownUrls = new Set(fromMarkdown.map(item => item.url))

  const fromBare = [...text.matchAll(BARE_MEDIA)]
    .map(match => match[0])
    .filter(url => !markdownUrls.has(url))
    .map(url => ({ url, alt: '' }))

  return [...fromMarkdown, ...fromBare].map(item => ({
    url: item.url,
    kind: kindOf(item.url),
    source,
    label: labelOf(item.url, item.alt)
  }))
}

// Gathers every image/gif/video URL referenced across a task's text surfaces —
// description, latest handoff, run summaries and comments — deduped by URL, in
// the order they were produced. autodev evidence (crabbox → Cloudflare/R2
// screenshots) lands in these surfaces, so this surfaces it without a schema change.
export function collectEvidence(detail: KanbanTaskDetail): EvidenceItem[] {
  const sources: Array<{ text: null | string | undefined; source: string }> = [
    { text: detail.task.body, source: 'Description' },
    { text: detail.task.latest_summary, source: 'Handoff' },
    ...detail.runs.map(runItem => ({ text: runItem.summary ?? runItem.error, source: 'Worker run' })),
    ...detail.comments.map(comment => ({ text: comment.body, source: `@${comment.author}` }))
  ]

  const seen = new Set<string>()

  return sources
    .flatMap(entry => scanText(entry.text ?? '', entry.source))
    .filter(item => {
      if (seen.has(item.url)) {
        return false
      }

      seen.add(item.url)

      return true
    })
}

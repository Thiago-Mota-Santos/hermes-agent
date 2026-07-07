import { useState } from 'react'

import { CopyButton } from '@/components/ui/copy-button'
import { ImageIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

import type { EvidenceItem } from './evidence'

interface EvidenceGalleryProps {
  items: EvidenceItem[]
}

function openExternal(url: string) {
  void window.hermesDesktop?.openExternal?.(url)
}

function EvidenceCard({ item }: { item: EvidenceItem }) {
  const [failed, setFailed] = useState(false)

  return (
    <figure className="group/tool-row flex flex-col overflow-hidden rounded-[8px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary)">
      <button
        className="relative block w-full cursor-zoom-in bg-black/20"
        onClick={() => openExternal(item.url)}
        title="Open full size"
        type="button"
      >
        {item.kind === 'video' ? (
          <video className="max-h-64 w-full object-contain" controls preload="metadata" src={item.url} />
        ) : failed ? (
          <span className="flex h-24 w-full items-center justify-center gap-1.5 text-[0.68rem] text-(--ui-text-tertiary)">
            <ImageIcon className="size-3.5" />
            Preview unavailable
          </span>
        ) : (
          <img
            alt={item.label}
            className="max-h-64 w-full object-contain"
            loading="lazy"
            onError={() => setFailed(true)}
            src={item.url}
          />
        )}
      </button>

      <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[0.7rem] text-(--ui-text-secondary)" title={item.label}>
            {item.label}
          </span>
          <span className="text-[0.6rem] text-(--ui-text-tertiary)">{item.source}</span>
        </div>
        <CopyButton appearance="tool-row" text={item.url} title="Copy URL" />
      </figcaption>
    </figure>
  )
}

// Renders evidence media (screenshots, GIFs, videos) collected from a task's
// text surfaces. Clicking a preview opens it full size in the OS browser; the
// per-card copy button yields the raw URL for pasting into a PR or chat.
export function EvidenceGallery({ items }: EvidenceGalleryProps) {
  if (items.length === 0) {
    return (
      <div className={cn('flex flex-col items-center gap-1.5 rounded-[8px] px-4 py-10 text-center')}>
        <ImageIcon className="size-5 text-(--ui-text-tertiary)" />
        <span className="text-xs text-(--ui-text-secondary)">No evidence captured yet</span>
        <span className="text-[0.68rem] leading-relaxed text-(--ui-text-tertiary)">
          Screenshots and recordings from staging validation appear here once the worker runs and reports them.
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map(item => (
        <EvidenceCard item={item} key={item.url} />
      ))}
    </div>
  )
}

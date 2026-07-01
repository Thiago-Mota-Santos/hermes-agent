import { useEffect, useRef } from 'react'

import { getSessionMessages } from '@/hermes'
import { type ChatMessage, toChatMessages } from '@/lib/chat-messages'
import { $activeProfile } from '@/store/profile'
import {
  $activeSessionId,
  $awaitingResponse,
  $busy,
  $messages,
  $selectedStoredSessionId,
  setMessages,
} from '@/store/session'

/**
 * Real-time cross-client transcript sync.
 *
 * Hermes has no cross-client push: a message written to a session from ANOTHER
 * client (e.g. the touri web app, a cron, or email) lands in the container's
 * stored transcript but never reaches this window's WebSocket. This hook polls
 * the open session's REST transcript while the window is idle and, when the
 * SERVER transcript changes between polls, replaces the live view with it — so
 * an externally-sent turn (both the prompt and the reply) shows up within a few
 * seconds.
 *
 * It is deliberately NON-DISRUPTIVE: it never runs while a turn is in progress
 * (busy / awaitingResponse / any pending message) and never shrinks or wipes the
 * view, so it cannot interrupt this window's own streaming turn. It reuses the
 * exact same $messages atom and toChatMessages() conversion the stream handler
 * uses, so external inserts and local streaming coexist.
 */
const POLL_INTERVAL_MS = 4000

const tailTextLength = (message: ChatMessage | undefined): number => {
  if (!message) {return 0}

  return message.parts.reduce((total, part) => {
    if (part.type === 'text' || part.type === 'reasoning') {
      return total + (part.text?.length ?? 0)
    }

    return total
  }, 0)
}

// Cheap change signature. Streaming assigns its own message ids, so id-diffing
// across the REST transcript and the live array is unreliable; count + tail
// role + tail text length catches an external turn landing without thrashing.
const signatureOf = (messages: ChatMessage[]): string => {
  const last = messages[messages.length - 1]

  return `${messages.length}:${last?.role ?? ''}:${tailTextLength(last)}`
}

export const useTranscriptSync = (): void => {
  const lastSignatureRef = useRef<{ storedId: string; signature: string } | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    const poll = async (): Promise<void> => {
      if (inFlightRef.current) {return}

      const storedId = $selectedStoredSessionId.get()
      const runtimeId = $activeSessionId.get()

      if (!storedId || !runtimeId) {return}

      // Never sync mid-turn — a forced replace would clobber the stream.
      if ($busy.get() || $awaitingResponse.get()) {return}

      const live = $messages.get()

      if (live.some(message => message.pending)) {return}

      inFlightRef.current = true

      try {
        const profile = $activeProfile.get()
        const response = await getSessionMessages(storedId, profile)
        const serverMessages = toChatMessages(response.messages ?? [])

        // Re-read guards after the await: the session may have switched or a new
        // turn may have started while the request was in flight.
        if ($selectedStoredSessionId.get() !== storedId) {return}

        if ($busy.get() || $awaitingResponse.get()) {return}

        if ($messages.get().some(message => message.pending)) {return}

        const signature = signatureOf(serverMessages)
        const previous = lastSignatureRef.current

        // First observation of this session: record the baseline without
        // replacing (resume already loaded the live view).
        if (!previous || previous.storedId !== storedId) {
          lastSignatureRef.current = { storedId, signature }

          return
        }

        if (previous.signature === signature) {return}

        lastSignatureRef.current = { storedId, signature }

        // Never wipe or shrink the view (guards against a transient empty/partial
        // transcript read); only surface externally-added turns.
        if (serverMessages.length === 0) {return}

        if (serverMessages.length < $messages.get().length) {return}

        setMessages(serverMessages)
      } catch {
        // Transient gateway/bridge error — try again on the next tick.
      } finally {
        inFlightRef.current = false
      }
    }

    const timer = setInterval(poll, POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [])
}

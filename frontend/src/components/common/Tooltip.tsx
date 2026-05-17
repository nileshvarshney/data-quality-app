'use client'
import { useRef, useState, useEffect, useCallback } from 'react'

interface TooltipProps {
  /** Plain string tooltip (simple use-case). */
  text?: string
  /** Rich JSX tooltip — takes precedence over `text`. */
  content?: React.ReactNode
  children: React.ReactNode
  /** Preferred placement. The component auto-flips if the tooltip would overflow. */
  position?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
  maxWidth?: number
  /** Delay before showing (ms). Default 250. */
  delay?: number
}

export default function Tooltip({
  text,
  content,
  children,
  position = 'top',
  className = 'inline-flex',
  maxWidth = 260,
  delay = 250,
}: TooltipProps) {
  const [visible, setVisible]   = useState(false)
  const [side, setSide]         = useState(position)
  // tipStyle holds the computed fixed-position coords.
  // Starts with visibility:hidden to prevent a flash at (0,0) before measurement.
  const [tipStyle, setTipStyle] = useState<React.CSSProperties>({ visibility: 'hidden' })

  const triggerRef = useRef<HTMLDivElement>(null)
  const tipRef     = useRef<HTMLDivElement>(null)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay)
  }, [delay])

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
    // Reset so the next show() re-measures from scratch
    setTipStyle({ visibility: 'hidden' })
    setSide(position)
  }, [position])

  // Compute position using fixed coordinates from getBoundingClientRect.
  // This prevents clipping by any overflow:auto/hidden ancestor (e.g. the
  // overflow-x-auto table wrapper in the Schema tab).
  useEffect(() => {
    if (!visible || !triggerRef.current || !tipRef.current) return

    const tr  = triggerRef.current.getBoundingClientRect()
    const tp  = tipRef.current.getBoundingClientRect()
    const vw  = window.innerWidth
    const vh  = window.innerHeight
    const GAP = 8

    // ── 1. Determine the best side (flip if preferred side has no room) ──────
    let best = position
    if (position === 'top'    && tr.top    < tp.height + GAP) best = 'bottom'
    if (position === 'bottom' && tr.bottom > vh - tp.height - GAP) best = 'top'
    if (position === 'left'   && tr.left   < tp.width  + GAP) best = 'right'
    if (position === 'right'  && tr.right  > vw - tp.width  - GAP) best = 'left'
    if (best !== side) setSide(best)

    // ── 2. Compute raw top/left (fixed, viewport-relative) ───────────────────
    let top: number
    let left: number

    if (best === 'top') {
      top  = tr.top - tp.height - GAP
      left = tr.left + tr.width / 2 - tp.width / 2
    } else if (best === 'bottom') {
      top  = tr.bottom + GAP
      left = tr.left + tr.width / 2 - tp.width / 2
    } else if (best === 'left') {
      top  = tr.top + tr.height / 2 - tp.height / 2
      left = tr.left - tp.width - GAP
    } else {
      // right
      top  = tr.top + tr.height / 2 - tp.height / 2
      left = tr.right + GAP
    }

    // ── 3. Clamp to viewport so tooltip never overflows any edge ─────────────
    left = Math.max(GAP, Math.min(vw - tp.width - GAP, left))
    top  = Math.max(GAP, Math.min(vh - tp.height - GAP, top))

    setTipStyle({ top, left, visibility: 'visible' })
  }, [visible, position, side])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const body = content ?? text
  if (!body) return <>{children}</>

  // Arrow direction: absolute inside the fixed bubble, points back toward trigger.
  const arrow: Record<string, string> = {
    top:    'top-full left-1/2 -translate-x-1/2 border-t-[#1a1f2e] border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-[#1a1f2e] border-x-transparent border-t-transparent',
    left:   'left-full top-1/2 -translate-y-1/2 border-l-[#1a1f2e] border-y-transparent border-r-transparent',
    right:  'right-full top-1/2 -translate-y-1/2 border-r-[#1a1f2e] border-y-transparent border-l-transparent',
  }

  return (
    <div
      ref={triggerRef}
      className={`relative ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      {/* Tooltip bubble — fixed so it escapes overflow:auto ancestors */}
      <div
        ref={tipRef}
        role="tooltip"
        style={{ maxWidth, width: 'max-content', ...tipStyle }}
        className={[
          'fixed z-[9999] pointer-events-none',
          visible && tipStyle.visibility === 'visible' ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
          'transition-all duration-150',
          'bg-[#1a1f2e] text-white text-[10px] leading-snug',
          'px-2.5 py-1.5 rounded-md shadow-lg ring-1 ring-white/10',
        ].join(' ')}
      >
        {typeof body === 'string' ? <span>{body}</span> : body}

        {/* Arrow */}
        <span className={['absolute w-0 h-0 border-4', arrow[side]].join(' ')} />
      </div>
    </div>
  )
}

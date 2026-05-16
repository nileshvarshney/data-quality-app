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
  const [visible, setVisible] = useState(false)
  const [side, setSide]       = useState(position)
  const triggerRef = useRef<HTMLDivElement>(null)
  const tipRef     = useRef<HTMLDivElement>(null)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay)
  }, [delay])

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }, [])

  // Auto-flip when the tooltip would overflow the viewport
  useEffect(() => {
    if (!visible || !triggerRef.current || !tipRef.current) return
    const tr = triggerRef.current.getBoundingClientRect()
    const tp = tipRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let best = position
    if (position === 'top'    && tr.top    < tp.height + 8) best = 'bottom'
    if (position === 'bottom' && tr.bottom > vh - tp.height - 8) best = 'top'
    if (position === 'left'   && tr.left   < tp.width  + 8) best = 'right'
    if (position === 'right'  && tr.right  > vw - tp.width  - 8) best = 'left'
    if (best !== side) setSide(best)
  }, [visible, position, side])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const body = content ?? text
  if (!body) return <>{children}</>

  const placement: Record<string, string> = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  }
  const arrow: Record<string, string> = {
    top:    'top-full left-1/2 -translate-x-1/2 border-t-gray-900 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900 border-x-transparent border-t-transparent',
    left:   'left-full top-1/2 -translate-y-1/2 border-l-gray-900 border-y-transparent border-r-transparent',
    right:  'right-full top-1/2 -translate-y-1/2 border-r-gray-900 border-y-transparent border-l-transparent',
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

      {/* Tooltip bubble */}
      <div
        ref={tipRef}
        role="tooltip"
        style={{ maxWidth, width: 'max-content' }}
        className={[
          'absolute z-[9999] pointer-events-none',
          placement[side],
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
          'transition-all duration-150',
          'bg-gray-900 text-white text-[11px] leading-relaxed',
          'px-3 py-2 rounded-lg shadow-xl',
        ].join(' ')}
      >
        {typeof body === 'string'
          ? <span>{body}</span>
          : body}

        {/* Arrow */}
        <span className={[
          'absolute w-0 h-0 border-4',
          arrow[side],
        ].join(' ')} />
      </div>
    </div>
  )
}

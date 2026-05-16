'use client'
import { useState, useEffect } from 'react'
import { HelpCircle, X, ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'

export interface HowItWorksStep {
  title: string
  description: string
  icon: React.ReactNode
}

interface Props {
  storageKey: string
  title: string
  steps: HowItWorksStep[]
}

export default function HowItWorks({ storageKey, title, steps }: Props) {
  const lsKey = `hiw-collapsed-${storageKey}`
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOpen(localStorage.getItem(lsKey) !== 'true')
    }
  }, [lsKey])

  const close = () => {
    setOpen(false)
    localStorage.setItem(lsKey, 'true')
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    localStorage.setItem(lsKey, next ? 'false' : 'true')
  }

  return (
    <div className="mb-6">
      {/* Toggle button shown when collapsed */}
      {!open && (
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <HelpCircle size={14} />
          How it works
          <ChevronDown size={13} />
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div className="rounded-xl border border-indigo-100 dark:border-indigo-800/40 bg-gradient-to-br from-indigo-50 to-slate-50 dark:from-slate-800 dark:to-slate-900 px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <HelpCircle size={15} className="text-indigo-500 dark:text-indigo-400" />
              <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">{title}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggle}
                className="flex items-center gap-1 text-xs text-indigo-400 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
              >
                <ChevronUp size={13} />
                Collapse
              </button>
              <button
                onClick={close}
                className="text-indigo-400 dark:text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors ml-1"
                title="Don't show again"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className={clsx(
            'grid gap-3',
            steps.length <= 3 ? 'grid-cols-1 sm:grid-cols-3' :
            steps.length === 4 ? 'grid-cols-2 sm:grid-cols-4' :
            'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
          )}>
            {steps.map((step, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 dark:bg-indigo-700 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-indigo-500 dark:text-indigo-400">{step.icon}</span>
                    <p className="text-xs font-semibold text-gray-800 dark:text-slate-200">{step.title}</p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

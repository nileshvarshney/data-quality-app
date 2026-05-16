'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

function OAuthCallbackInner() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const token   = params.get('token')
    const refresh = params.get('refresh')
    const error   = params.get('error')

    if (error) {
      toast.error(`SSO login failed: ${error}`)
      router.replace('/login')
      return
    }

    if (!token) {
      toast.error('SSO callback received no token — please try again')
      router.replace('/login')
      return
    }

    localStorage.setItem('access_token', token)
    if (refresh) localStorage.setItem('refresh_token', refresh)
    router.replace('/dashboard/global')
  }, [params, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[var(--bg)]">
      <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-[var(--text-3)]">
        <Loader2 size={28} className="animate-spin text-indigo-500" />
        <p className="text-sm">Completing sign-in…</p>
      </div>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[var(--bg)]">
        <Loader2 size={28} className="animate-spin text-indigo-500" />
      </div>
    }>
      <OAuthCallbackInner />
    </Suspense>
  )
}

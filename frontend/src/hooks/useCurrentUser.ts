'use client'
import { useState, useEffect } from 'react'

export interface CurrentUser {
  user_id: string
  email: string
  full_name: string
  role: 'admin' | 'domain_owner' | 'data_owner' | 'viewer' | 'auditor'
  domain_id: string | null
}

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    if (!token) {
      // Dev mode fallback: treat as admin when auth is not required
      setUser({ user_id: 'system', email: 'admin@example.com', full_name: 'System Admin', role: 'admin', domain_id: null })
      return
    }
    const payload = parseJwt(token)
    if (!payload) { setUser(null); return }
    setUser({
      user_id: payload.user_id as string || payload.sub as string,
      email: payload.email as string,
      full_name: payload.full_name as string || payload.email as string,
      role: (payload.role as CurrentUser['role']) || 'viewer',
      domain_id: (payload.domain_id as string) || null,
    })
  }, [])

  return user
}

export function useIsAdmin(): boolean {
  const user = useCurrentUser()
  return user?.role === 'admin'
}

export function useCanWrite(): boolean {
  const user = useCurrentUser()
  return ['admin', 'domain_owner', 'data_owner'].includes(user?.role ?? '')
}

import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/shared/context/AuthProvider'
import type { Role } from '@/shared/types'
import type { ReactNode } from 'react'

export function ProtectedRoute({
  role,
  children,
}: {
  role?: Role
  children: ReactNode
}) {
  const { user, appUser, loading, configured } = useAuth()
  const location = useLocation()

  if (!configured) return <Navigate to="/login" replace />
  if (loading) return <div className="h-screen w-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (!appUser?.role) return <Navigate to="/role" replace />
  if (role && appUser.role !== role) {
    return <Navigate to={appUser.role === 'teacher' ? '/teacher' : '/student'} replace />
  }
  return <>{children}</>
}

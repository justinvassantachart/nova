import { Navigate } from 'react-router-dom'
import { useAuth } from '@/shared/context/AuthProvider'

export default function RootRedirect() {
  const { user, appUser, loading, configured } = useAuth()
  if (!configured) return <Navigate to="/ide" replace />
  if (loading) return <div className="h-screen w-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!appUser?.role) return <Navigate to="/role" replace />
  return <Navigate to={appUser.role === 'teacher' ? '/teacher' : '/student'} replace />
}

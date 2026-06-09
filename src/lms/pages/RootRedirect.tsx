import { useAuth } from '@/shared/context/auth-context'

export default function RootRedirect() {
  const { user, loading, configured } = useAuth()
  if (!configured) {
    window.location.replace('/ide')
    return null
  }
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!user) {
    window.location.replace('/login')
    return null
  }
  window.location.replace('/dashboard')
  return null
}

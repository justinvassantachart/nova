import { signOut } from '@/shared/firebase/auth'
import { useAuth } from '@/shared/context/AuthProvider'

export function UserMenu() {
  const { appUser } = useAuth()
  if (!appUser) return null
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">
        {appUser.displayName || appUser.email}
      </span>
      <button onClick={() => signOut()} className="underline text-xs">
        Sign out
      </button>
    </div>
  )
}

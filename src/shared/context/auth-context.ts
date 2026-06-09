// Context + hook live apart from the provider component so files exporting
// components export nothing else (react-refresh/only-export-components).
import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'
import type { AppUser } from '@/shared/types'

export type AuthState = {
  user: User | null
  appUser: AppUser | null
  loading: boolean
  configured: boolean
}

export const AuthContext = createContext<AuthState>({
  user: null,
  appUser: null,
  loading: true,
  configured: false,
})

export function useAuth() {
  return useContext(AuthContext)
}

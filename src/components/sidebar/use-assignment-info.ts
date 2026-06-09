// Context + hook live apart from the provider component so files exporting
// components export nothing else (react-refresh/only-export-components).
import { createContext, useContext } from 'react'
import type { AssignmentInfo } from '@/ide-host'

export const AssignmentInfoContext = createContext<AssignmentInfo | undefined>(undefined)

export function useAssignmentInfo(): AssignmentInfo | undefined {
    return useContext(AssignmentInfoContext)
}

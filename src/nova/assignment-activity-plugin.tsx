import type { IDEPlugin } from 'web-ide'
import { AssignmentView } from '@/components/sidebar/AssignmentView'

/** Host-owned LMS activity supplied through Web IDE's open plugin contract. */
export const assignmentActivityPlugin: IDEPlugin = {
  id: 'nova.assignment-activity',
  contributes: {
    activities: [
      {
        id: 'nova.assignment',
        title: 'Assignment',
        icon: 'checklist',
        component: AssignmentView,
        order: 10,
      },
    ],
  },
}

import { LessonWorkspace } from './LessonRunner'
import { demoLesson } from './demo-lesson'

/** Public, anonymous tour; deliberately outside the ten-lesson registry. */
export default function GuidedDemo() {
    return <LessonWorkspace lesson={demoLesson} demo />
}

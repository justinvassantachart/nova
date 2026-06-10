// The lesson registry. Order here is the order on /learn and the order of
// "next lesson" navigation. Lessons are plain data (see ../types.ts) — to
// add one, write a Lesson object and list it here.

import type { Lesson } from '../types'
import { helloDebugger } from './01-hello-debugger'
import { functionsAndTheStack } from './02-functions-and-the-stack'
import { aiBugHuntOffByOne } from './03-ai-bug-hunt-off-by-one'
import { linkedListsLive } from './04-linked-lists-live'
import { aiBugHuntReversal } from './05-ai-bug-hunt-reversal'
import { aiBugHuntTests } from './06-ai-bug-hunt-tests'

export const LESSONS: Lesson[] = [
    helloDebugger,
    functionsAndTheStack,
    aiBugHuntOffByOne,
    linkedListsLive,
    aiBugHuntReversal,
    aiBugHuntTests,
]

export function lessonBySlug(slug: string | undefined): Lesson | undefined {
    return LESSONS.find((l) => l.slug === slug)
}

export function nextLesson(lesson: Lesson): Lesson | undefined {
    const i = LESSONS.findIndex((l) => l.id === lesson.id)
    return i >= 0 ? LESSONS[i + 1] : undefined
}

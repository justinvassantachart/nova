// The lesson registry. Order here is the order on /learn and the order of
// "next lesson" navigation. Lessons are plain data (see ../types.ts) — to
// add one, write a Lesson object and list it here.
//
// The series is a single arc: a student fresh out of a CS1 Python course
// learns C++ (lessons 1–7), then linked lists (8–10). Every lesson teaches
// new language ground AND embeds an "AI bug hunt" assignment — plausible
// AI-generated code whose bug is flushed out with unit tests and the
// debugger — so the tooling is learned in service of the language, not the
// other way around.

import type { Lesson } from '../types'
import { fromPythonToCpp } from './01-from-python-to-cpp'
import { typesAndVariables } from './02-types-and-variables'
import { functionsAndCopies } from './03-functions-and-copies'
import { vectorsAndLoops } from './04-vectors-and-loops'
import { pointersLesson } from './05-pointers'
import { newAndDelete } from './06-new-and-delete'
import { structsLesson } from './07-structs'
import { buildingLinkedLists } from './08-building-linked-lists'
import { linkedListEdgeCases } from './09-linked-list-edge-cases'
import { reverseALinkedList } from './10-reverse-a-linked-list'

export const LESSONS: Lesson[] = [
    fromPythonToCpp,
    typesAndVariables,
    functionsAndCopies,
    vectorsAndLoops,
    pointersLesson,
    newAndDelete,
    structsLesson,
    buildingLinkedLists,
    linkedListEdgeCases,
    reverseALinkedList,
]

export function lessonBySlug(slug: string | undefined): Lesson | undefined {
    return LESSONS.find((l) => l.slug === slug)
}

export function nextLesson(lesson: Lesson): Lesson | undefined {
    const i = LESSONS.findIndex((l) => l.id === lesson.id)
    return i >= 0 ? LESSONS[i + 1] : undefined
}

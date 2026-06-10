// Lesson progress, persisted to localStorage so the series works without
// an account. Completion is sticky: many checks describe transient debugger
// states (paused on a line, a variable mid-loop), so once a step's check
// passes it stays passed here even after the state moves on.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LessonProgress = {
    // Index of the step the learner is currently viewing.
    currentStep: number
    completedSteps: string[]
    completedAt?: number
    // Bumped on "reset lesson" — composed into the OPFS project id so the
    // workspace re-seeds from the lesson's starter files in a fresh
    // namespace, with no race against in-flight persistence of old edits.
    resetNonce: number
}

const EMPTY: LessonProgress = { currentStep: 0, completedSteps: [], resetNonce: 0 }

interface LessonProgressState {
    byLesson: Record<string, LessonProgress>
    get: (lessonId: string) => LessonProgress
    setCurrentStep: (lessonId: string, step: number) => void
    markStepComplete: (lessonId: string, stepId: string) => void
    markLessonComplete: (lessonId: string) => void
    resetLesson: (lessonId: string) => void
}

export const useLessonProgress = create<LessonProgressState>()(
    persist(
        (set, get) => ({
            byLesson: {},

            get: (lessonId) => get().byLesson[lessonId] ?? EMPTY,

            setCurrentStep: (lessonId, step) => set((s) => {
                const prev = s.byLesson[lessonId] ?? EMPTY
                return { byLesson: { ...s.byLesson, [lessonId]: { ...prev, currentStep: step } } }
            }),

            markStepComplete: (lessonId, stepId) => set((s) => {
                const prev = s.byLesson[lessonId] ?? EMPTY
                if (prev.completedSteps.includes(stepId)) return s
                return {
                    byLesson: {
                        ...s.byLesson,
                        [lessonId]: { ...prev, completedSteps: [...prev.completedSteps, stepId] },
                    },
                }
            }),

            markLessonComplete: (lessonId) => set((s) => {
                const prev = s.byLesson[lessonId] ?? EMPTY
                if (prev.completedAt) return s
                return { byLesson: { ...s.byLesson, [lessonId]: { ...prev, completedAt: Date.now() } } }
            }),

            resetLesson: (lessonId) => set((s) => {
                const prev = s.byLesson[lessonId] ?? EMPTY
                return {
                    byLesson: {
                        ...s.byLesson,
                        [lessonId]: { ...EMPTY, resetNonce: prev.resetNonce + 1 },
                    },
                }
            }),
        }),
        { name: 'nova.lessons.v1' },
    ),
)

import React from 'react'
import { useNavigate, useMatch } from '@tanstack/react-router'
import { parseWeekId, weekNavigation, weeksInYear } from '../domain/calendar/weeks.ts'
import { parseMonthId, monthNavigation } from '../domain/calendar/months.ts'
import { parseDayId, dayNavigation } from '../domain/calendar/days.ts'

interface PageNavigationProps {
    plannerId?: string
    /** Provided by the weekly loader; preferred because it already handles year rollover. */
    nextWeekId?: string
    prevWeekId?: string
    /** Provided by the daily loader. */
    nextDayId?: string
    prevDayId?: string
}

type Targets =
    | { kind: 'weekly'; plannerId: string; prev: string; next: string }
    | { kind: 'monthly'; plannerId: string; prev: string; next: string }
    | { kind: 'daily'; plannerId: string; prev: string; next: string }

// Work out where "previous" and "next" go from the current route: weekly pages step left/right
// page by page, monthly pages step a month, daily pages step a day. Returns null when the route
// is none of these.
function resolveTargets(
    params: { plannerId?: string; weekId?: string; monthId?: string; dayId?: string },
    { plannerId: plannerIdProp, nextWeekId, prevWeekId, nextDayId, prevDayId }: PageNavigationProps,
): Targets | null {
    const plannerId = plannerIdProp || params.plannerId
    if (!plannerId) return null

    if (params.weekId) {
        if (nextWeekId && prevWeekId) {
            return { kind: 'weekly', plannerId, prev: prevWeekId, next: nextWeekId }
        }
        try {
            const { week, year, side } = parseWeekId(params.weekId)
            const nav = weekNavigation(week, year, side, weeksInYear(year))
            return { kind: 'weekly', plannerId, prev: nav.prevWeekId, next: nav.nextWeekId }
        } catch {
            return null
        }
    }

    if (params.monthId) {
        try {
            const { month, year } = parseMonthId(params.monthId)
            const nav = monthNavigation(month, year)
            return { kind: 'monthly', plannerId, prev: nav.prevMonthId, next: nav.nextMonthId }
        } catch {
            return null
        }
    }

    if (params.dayId) {
        if (nextDayId && prevDayId) {
            return { kind: 'daily', plannerId, prev: prevDayId, next: nextDayId }
        }
        try {
            const nav = dayNavigation(parseDayId(params.dayId))
            return { kind: 'daily', plannerId, prev: nav.prevDayId, next: nav.nextDayId }
        } catch {
            return null
        }
    }

    return null
}

export default function PageNavigation(props: PageNavigationProps) {
    const navigate = useNavigate()
    const match = useMatch({ strict: false })
    const params = (match?.params ?? {}) as { plannerId?: string; weekId?: string; monthId?: string; dayId?: string }
    const targets = resolveTargets(params, props)

    const go = React.useCallback(
        (direction: 'prev' | 'next') => {
            if (!targets) return
            const id = targets[direction]
            if (targets.kind === 'weekly') {
                void navigate({
                    to: '/planners/$plannerId/weekly/$weekId',
                    params: { plannerId: targets.plannerId, weekId: id },
                })
            } else if (targets.kind === 'monthly') {
                void navigate({
                    to: '/planners/$plannerId/monthly/$monthId',
                    params: { plannerId: targets.plannerId, monthId: id },
                })
            } else {
                void navigate({
                    to: '/planners/$plannerId/daily/$dayId',
                    params: { plannerId: targets.plannerId, dayId: id },
                })
            }
        },
        // targets is rebuilt each render; its fields are what matter
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [navigate, targets?.kind, targets?.plannerId, targets?.prev, targets?.next],
    )

    // Swipe gesture: right-to-left => next, left-to-right => prev
    React.useEffect(() => {
        if (!targets) return undefined
        let startX: number | null = null
        let startY: number | null = null
        let tracking = false
        let handled = false

        const isInteractiveTarget = (el: EventTarget | null) => {
            if (!(el instanceof Element)) return false
            const editable = el.closest('[contenteditable="true"]')
            const input = el.closest('input, textarea, select, button')
            const tiptap = el.closest('.tiptap')
            const tldraw = el.closest('[data-tldraw]')
            return !!(editable || input || tiptap || tldraw)
        }

        const onTouchStart = (e: TouchEvent) => {
            if (handled) return
            // Only track single-finger swipes
            if (e.touches?.length !== 1) return
            const t = e.touches[0]
            // Avoid starting swipe in interactive areas
            if (isInteractiveTarget(e.target)) return
            startX = t.clientX
            startY = t.clientY
            tracking = true
        }

        const onTouchEnd = (e: TouchEvent) => {
            if (!tracking || handled) return
            tracking = false
            const t = e.changedTouches?.[0]
            if (!t || startX === null || startY === null) return
            const dx = t.clientX - startX
            const dy = t.clientY - startY
            const absDx = Math.abs(dx)
            const absDy = Math.abs(dy)
            // Require a reasonably horizontal swipe
            const minDistance = 60
            const horizontalEnough = absDx > minDistance && absDx > absDy * 1.5
            if (!horizontalEnough) return

            handled = true
            // Right-to-left (dx < 0) navigates forward, left-to-right backward
            go(dx < 0 ? 'next' : 'prev')
            // Reset handled after a tick to allow subsequent swipes
            setTimeout(() => { handled = false }, 250)
        }

        window.addEventListener('touchstart', onTouchStart, { passive: true })
        window.addEventListener('touchend', onTouchEnd, { passive: true })

        return () => {
            window.removeEventListener('touchstart', onTouchStart)
            window.removeEventListener('touchend', onTouchEnd)
        }
    }, [go, targets === null])

    if (!targets) return null
    const unit = targets.kind === 'monthly' ? 'month' : targets.kind === 'daily' ? 'day' : 'week'

    return (
        <div className="page-navigation">
            <button
                className="button-prev"
                onClick={() => go('prev')}
                aria-label={`Previous ${unit}`}
            />
            <button
                className="button-next"
                onClick={() => go('next')}
                aria-label={`Next ${unit}`}
            />
        </div>
    )
}

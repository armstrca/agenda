import React from 'react'
import { useNavigate, useMatch } from '@tanstack/react-router'
import { parseWeekId, weekNavigation, weekPageIdForDate, weeksInYear } from '../domain/calendar/weeks.ts'
import { formatMonthId, parseMonthId, monthNavigation } from '../domain/calendar/months.ts'
import { parseDayId, dayNavigation } from '../domain/calendar/days.ts'
import { monthOf, todayISO, yearOf } from '../domain/dates.ts'
import { plannerWeekStartIndex } from '../domain/planners.ts'
import type { Planner } from '../domain/types.ts'

interface PageNavigationProps {
    plannerId?: string
    /** Provided by the weekly loader; preferred because it already handles year rollover. */
    nextWeekId?: string
    prevWeekId?: string
    /** Provided by the daily loader. */
    nextDayId?: string
    prevDayId?: string
}

type RouteParams = { plannerId?: string; weekId?: string; monthId?: string; dayId?: string }

/** A page to go to: a planner page by kind and id, or the index page. */
type Destination =
    | { kind: 'weekly' | 'monthly' | 'daily'; plannerId: string; id: string }
    | { kind: 'index' }

type Targets = {
    kind: 'weekly' | 'monthly' | 'daily'
    prev: Destination
    next: Destination
    /** Swipe bottom-to-top. */
    up?: Destination
    /** Swipe top-to-bottom. */
    down?: Destination
}

// Work out where "previous" and "next" go from the current route: weekly pages step left/right
// page by page, monthly pages step a month, daily pages step a day. Returns null when the route
// is none of these.
function resolveTargets(
    params: RouteParams,
    { plannerId: plannerIdProp, nextWeekId, prevWeekId, nextDayId, prevDayId }: PageNavigationProps,
    planner: Planner | null,
): Targets | null {
    const plannerId = plannerIdProp || params.plannerId
    if (!plannerId) return null
    const page = (kind: 'weekly' | 'monthly' | 'daily', id: string): Destination => ({ kind, plannerId, id })

    // Vertical swipes move between page types (day <-> week <-> month). The weekly page for a date
    // depends on the planner's week-start day, so those targets wait until the planner is loaded.
    const weekStart = planner ? plannerWeekStartIndex(planner) : null
    const today = todayISO()

    if (params.weekId) {
        let prev = prevWeekId
        let next = nextWeekId
        if (!prev || !next) {
            try {
                const { week, year, side } = parseWeekId(params.weekId)
                const nav = weekNavigation(week, year, side, weeksInYear(year))
                prev = nav.prevWeekId
                next = nav.nextWeekId
            } catch {
                return null
            }
        }
        return {
            kind: 'weekly',
            prev: page('weekly', prev),
            next: page('weekly', next),
            down: page('monthly', formatMonthId(monthOf(today), yearOf(today))),
            up: page('daily', today),
        }
    }

    if (params.monthId) {
        try {
            const { month, year } = parseMonthId(params.monthId)
            const nav = monthNavigation(month, year)
            return {
                kind: 'monthly',
                prev: page('monthly', nav.prevMonthId),
                next: page('monthly', nav.nextMonthId),
                up: weekStart === null ? undefined : page('weekly', weekPageIdForDate(today, weekStart)),
                down: { kind: 'index' },
            }
        } catch {
            return null
        }
    }

    if (params.dayId) {
        try {
            const day = parseDayId(params.dayId)
            const nav = nextDayId && prevDayId ? { nextDayId, prevDayId } : dayNavigation(day)
            return {
                kind: 'daily',
                prev: page('daily', nav.prevDayId),
                next: page('daily', nav.nextDayId),
                down: weekStart === null ? undefined : page('weekly', weekPageIdForDate(day, weekStart)),
            }
        } catch {
            return null
        }
    }

    return null
}

export default function PageNavigation(props: PageNavigationProps) {
    const navigate = useNavigate()
    const match = useMatch({ strict: false })
    const params = (match?.params ?? {}) as RouteParams
    const plannerMatch = useMatch({ from: '/planners/$plannerId', shouldThrow: false })
    const targets = resolveTargets(params, props, plannerMatch?.loaderData?.planner ?? null)

    const goTo = React.useCallback(
        (destination: Destination | undefined) => {
            if (!destination) return
            switch (destination.kind) {
                case 'index':
                    void navigate({ to: '/' })
                    break
                case 'weekly':
                    void navigate({
                        to: '/planners/$plannerId/weekly/$weekId',
                        params: { plannerId: destination.plannerId, weekId: destination.id },
                    })
                    break
                case 'monthly':
                    void navigate({
                        to: '/planners/$plannerId/monthly/$monthId',
                        params: { plannerId: destination.plannerId, monthId: destination.id },
                    })
                    break
                case 'daily':
                    void navigate({
                        to: '/planners/$plannerId/daily/$dayId',
                        params: { plannerId: destination.plannerId, dayId: destination.id },
                    })
                    break
            }
        },
        [navigate],
    )

    // The listeners below read the latest targets through a ref, so they are attached once per
    // page rather than re-attached on every render.
    const targetsRef = React.useRef(targets)
    targetsRef.current = targets
    const hasTargets = targets !== null

    // Swipe gestures: right-to-left => next, left-to-right => prev; top-to-bottom => targets.down,
    // bottom-to-top => targets.up. A vertical swipe is also how a tall page scrolls, so it only
    // navigates when the page is already scrolled as far as that swipe would scroll it (top for a
    // downward swipe, bottom for an upward one), like pull-to-refresh.
    React.useEffect(() => {
        if (!hasTargets) return undefined
        let startX: number | null = null
        let startY: number | null = null
        let atTop = false
        let atBottom = false
        let tracking = false
        let handled = false

        const isInteractiveTarget = (el: EventTarget | null) => {
            if (!(el instanceof Element)) return false
            const editable = el.closest('[contenteditable="true"]')
            const input = el.closest('input, textarea, select, button, a')
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
            const scroller = document.scrollingElement ?? document.documentElement
            atTop = scroller.scrollTop <= 0
            atBottom = scroller.scrollTop + window.innerHeight >= scroller.scrollHeight - 1
            tracking = true
        }

        const onTouchEnd = (e: TouchEvent) => {
            if (!tracking || handled) return
            tracking = false
            const current = targetsRef.current
            const t = e.changedTouches?.[0]
            if (!current || !t || startX === null || startY === null) return
            const dx = t.clientX - startX
            const dy = t.clientY - startY
            const absDx = Math.abs(dx)
            const absDy = Math.abs(dy)
            const minDistance = 60

            let destination: Destination | undefined
            if (absDx > minDistance && absDx > absDy * 1.5) {
                // Right-to-left (dx < 0) navigates forward, left-to-right backward
                destination = dx < 0 ? current.next : current.prev
            } else if (absDy > minDistance && absDy > absDx * 1.5) {
                // Top-to-bottom (dy > 0) => down, bottom-to-top => up
                destination = dy > 0 ? (atTop ? current.down : undefined) : (atBottom ? current.up : undefined)
            }
            if (!destination) return

            handled = true
            goTo(destination)
            // Reset handled after a tick to allow subsequent swipes
            setTimeout(() => { handled = false }, 250)
        }

        window.addEventListener('touchstart', onTouchStart, { passive: true })
        window.addEventListener('touchend', onTouchEnd, { passive: true })

        return () => {
            window.removeEventListener('touchstart', onTouchStart)
            window.removeEventListener('touchend', onTouchEnd)
        }
    }, [goTo, hasTargets])

    if (!targets) return null
    const unit = targets.kind === 'monthly' ? 'month' : targets.kind === 'daily' ? 'day' : 'week'

    return (
        <div className="page-navigation">
            <button
                className="button-prev"
                onClick={() => goTo(targets.prev)}
                aria-label={`Previous ${unit}`}
            />
            <button
                className="button-next"
                onClick={() => goTo(targets.next)}
                aria-label={`Next ${unit}`}
            />
        </div>
    )
}

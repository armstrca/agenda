import React from 'react'
import { useNavigate, useParams, useMatch } from '@tanstack/react-router'

export default function PageNavigation({ plannerId: plannerIdProp, nextWeekId, prevWeekId }) {
    const navigate = useNavigate()
    const match = useMatch({ strict: false })
    const params = match.params || {}

    // Get plannerId from either route type
    const plannerId = plannerIdProp || params.plannerId

    let prevPath = ''
    let nextPath = ''
    let isMonthly = false

    if (params.weekId) {
        // Handle weekly navigation
        // Prefer backend-provided navigation ids to handle year rollover correctly
        if (nextWeekId && prevWeekId) {
            nextPath = `/planners/${plannerId}/weekly/${nextWeekId}`
            prevPath = `/planners/${plannerId}/weekly/${prevWeekId}`
        } else {
            const match = params.weekId.match(/^(\d{1,2})_(\d{4})_([lr])$/)
            if (!match) return null
            const [, weekNumStr, year, side] = match
            const weekNumber = parseInt(weekNumStr, 10)
            const nextSide = side === 'r' ? 'l' : 'r'
            const nextWeekNumber = side === 'r' ? weekNumber + 1 : weekNumber
            nextPath = `/planners/${plannerId}/weekly/${nextWeekNumber}_${year}_${nextSide}`
            const prevSide = side === 'l' ? 'r' : 'l'
            const prevWeekNumber = side === 'l' ? weekNumber - 1 : weekNumber
            prevPath = `/planners/${plannerId}/weekly/${prevWeekNumber}_${year}_${prevSide}`
        }
    } else if (params.monthId) {
        // Handle monthly navigation
        isMonthly = true
        const match = params.monthId.match(/^(\d{2})_(\d{4})$/)
        if (!match) return null

        let [_, monthStr, yearStr] = match
        let month = parseInt(monthStr, 10)
        let year = parseInt(yearStr, 10)

        // Calculate next month
        const nextMonth = month === 12 ? 1 : month + 1
        const nextYear = month === 12 ? year + 1 : year
        const nextMonthId = `${String(nextMonth).padStart(2, '0')}_${nextYear}`
        nextPath = `/planners/${plannerId}/monthly/${nextMonthId}`

        // Calculate previous month
        const prevMonth = month === 1 ? 12 : month - 1
        const prevYear = month === 1 ? year - 1 : year
        const prevMonthId = `${String(prevMonth).padStart(2, '0')}_${prevYear}`
        prevPath = `/planners/${plannerId}/monthly/${prevMonthId}`
    } else {
        return null
    }

    // Swipe gesture: right-to-left => next, left-to-right => prev
    React.useEffect(() => {
        let startX = null
        let startY = null
        let tracking = false
        let handled = false

        const isInteractiveTarget = (el) => {
            if (!el) return false
            const editable = el.closest('[contenteditable="true"]')
            const input = el.closest('input, textarea, select, button')
            const tiptap = el.closest('.tiptap')
            const tldraw = el.closest('[data-tldraw]')
            return !!(editable || input || tiptap || tldraw)
        }

        const onTouchStart = (e) => {
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

        const onTouchMove = (e) => {
            if (!tracking || handled) return
            // Allow movement, but don't preventDefault to keep scrolling
        }

        const onTouchEnd = (e) => {
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
            // Right-to-left (dx < 0) should navigate forward (next)
            if (dx < 0 && nextPath) {
                navigate({ to: nextPath })
            }
            // Left-to-right (dx > 0) should navigate backward (prev)
            else if (dx > 0 && prevPath) {
                navigate({ to: prevPath })
            }
            // Reset handled after a tick to allow subsequent swipes
            setTimeout(() => { handled = false }, 250)
        }

        window.addEventListener('touchstart', onTouchStart, { passive: true })
        window.addEventListener('touchmove', onTouchMove, { passive: true })
        window.addEventListener('touchend', onTouchEnd, { passive: true })

        return () => {
            window.removeEventListener('touchstart', onTouchStart)
            window.removeEventListener('touchmove', onTouchMove)
            window.removeEventListener('touchend', onTouchEnd)
        }
        // Rebind if the target paths change
    }, [navigate, nextPath, prevPath])

    return (
        <div className="page-navigation">
            <button
                className="button-prev"
                onClick={() => navigate({ to: prevPath })}
                aria-label={isMonthly ? "Previous month" : "Previous week"}
            />
            <button
                className="button-next"
                onClick={() => navigate({ to: nextPath })}
                aria-label={isMonthly ? "Next month" : "Next week"}
            />
        </div>
    )
}
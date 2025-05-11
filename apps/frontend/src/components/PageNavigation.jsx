import React from 'react'
import { useNavigate, useParams, useMatch } from '@tanstack/react-router'

export default function PageNavigation() {
    const navigate = useNavigate()
    const match = useMatch({ strict: false })
    const params = match.params || {}

    // Get plannerId from either route type
    const plannerId = params.plannerId

    let prevPath = ''
    let nextPath = ''
    let isMonthly = false

    if (params.weekId) {
        // Handle weekly navigation
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
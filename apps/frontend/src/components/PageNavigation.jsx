import React from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Route as WeeklyRoute } from '../routes/weekly.$weekId' // <-- import your route

export default function PageNavigation() {
    const { weekId } = useParams({ from: WeeklyRoute.id }) // ✅ pass route ID
    const navigate = useNavigate()

    // Try to parse weekId into [number, year, side]
    const match = weekId?.match(/^(\d{1,2})_(\d{4})_([lr])$/)
    if (!match) {
        return null
    }

    const [, weekNumStr, year, side] = match
    const weekNumber = parseInt(weekNumStr, 10)

    const nextSide = side === 'r' ? 'l' : 'r'
    const nextWeekNumber = side === 'r' ? weekNumber + 1 : weekNumber
    const nextWeekId = `${nextWeekNumber}_${year}_${nextSide}`
    const nextPath = `/weekly/${nextWeekId}`

    const prevSide = side === 'l' ? 'r' : 'l'
    const prevWeekNumber = side === 'l' ? weekNumber - 1 : weekNumber
    const prevWeekId = `${prevWeekNumber}_${year}_${prevSide}`
    const prevPath = `/weekly/${prevWeekId}`

    return (
        <div className="page-navigation">
            <button
                className="button-prev"
                onClick={() => navigate({ to: prevPath })}
            />
            <button
                className="button-next"
                onClick={() => navigate({ to: nextPath })}
            />
        </div>
    )
}

import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Planner } from '../types/types'
import { apiClient } from '../api/api'

export const Route = createFileRoute('/planners')({
  component: PlannersIndex
})

function PlannersIndex() {
  const [planners, setPlanners] = useState<Planner[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadPlanners() {
      try {
        const data = await apiClient.getPlanners(); // Changed from apiClient.get()
        // Ensure each planner object matches the Planner type
        const plannersArray = Array.isArray(data) ? data : [data];
        setPlanners(
          plannersArray.map((item: any) => ({
            id: item.id,
            user_id: item.user_id,
            name: item.name,
            created_at: item.created_at,
            updated_at: item.updated_at,
            // Add other Planner fields if needed
            template: item.template,
            plannerEntries: item.plannerEntries,
            tldraw_snapshots: item.tldraw_snapshots,
            weekData: item.weekData,
            page_id: item.page_id,
            planner_id: item.planner_id,
          }))
        );
      } catch (error) {
        console.error('Failed to fetch planners:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadPlanners();
  }, []);

  if (isLoading) return <div>Loading...</div>

  function getCurrentWeekId() {
    const date = new Date();
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);

    return `${String(weekNumber).padStart(2, '0')}_${date.getFullYear()}_l`;
  }

  return (
    <div className="planner-container">
      <Outlet />
    </div>
  )
}
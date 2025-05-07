export async function fetchPlanners() {
    const response = await fetch('/planners')
    if (!response.ok) throw new Error('Failed to fetch planners')
    return response.json()
}
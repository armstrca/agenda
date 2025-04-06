import React from 'react';
import WeeklyLeft from './WeeklyLeft';

function WeeklyPage({ params, initialData }) {
  return (
    <WeeklyLeft
      weekId={params.weekId}
      displayMonthYear={initialData.displayMonthYear}
      mainDates={initialData.mainDates}
      holidays={initialData.holidays}
      moonPhases={initialData.moonPhases}
    />
  );
}

export default WeeklyPage;

function getCurrentWeekId() {
  const today = new Date();
  const weekNumber = Math.ceil((today.getDate() - today.getDay() + 1) / 7);
  const year = today.getFullYear();
  return `${weekNumber}_${year}`;
}
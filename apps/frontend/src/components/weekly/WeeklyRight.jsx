// apps/frontend/src/components/weekly/WeeklyRight.jsx
import React from 'react';
import TemplateRenderer from './TemplateRenderer';
import Tiptap from '../Tiptap';
import TlDrawComponent from '../TLDrawComponent';

const WeeklyRight = ({
    template,
    page_id,
    weekNumber,
    year,
    mainDates,
    holidays,
    moonPhases,
    plannerId,
    tldraw_snapshots
}) => {
    const components = {
        Tiptap: (props) => <Tiptap {...props} weekId={`${weekNumber}_${year}_r`} />,
        TlDrawComponent: () => (
            <TlDrawComponent
                persistenceKey={`weekly-${weekNumber}-${year}-r`}
                plannerId={plannerId}
                tldraw_snapshots={tldraw_snapshots}
            />
        )
    };

    // Get the first day of the current week's month
    const weekStart = new Date(mainDates[0]);
    const currentMonth = weekStart.getMonth();
    const currentYear = weekStart.getFullYear();

    // Calculate next month
    const nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
    const nextMonth = nextMonthDate.getMonth();
    const nextMonthYear = nextMonthDate.getFullYear();

    // Generate calendar data for both months
    const generateCalendarData = (month, year) => {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const weeks = [];
        let week = [];

        // Fill initial empty days
        for (let i = 0; i < firstDay.getDay(); i++) {
            week.push(null);
        }

        // Fill calendar days
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(year, month, day);
            week.push(date);

            if (week.length === 7) {
                weeks.push(week);
                week = [];
            }
        }

        // Fill remaining empty days
        if (week.length > 0) {
            while (week.length < 7) {
                week.push(null);
            }
            weeks.push(week);
        }

        return weeks;
    };

    // Generate data for both calendars
    const leftCalendar = generateCalendarData(currentMonth, currentYear);
    const rightCalendar = generateCalendarData(nextMonth, nextMonthYear);

    // Create button data mapping
    const createButtonData = (weeks, startId = 1) => {
        const buttonData = {};
        let buttonId = startId;

        weeks.forEach(week => {
            week.forEach(date => {
                buttonData[buttonId] = date ? date.getDate() : '';
                buttonId++;
            });
        });

        return buttonData;
    };

    // Update calendar data generation
    const leftButtonData = createButtonData(leftCalendar, 36); // IDs 36-70
    const rightButtonData = createButtonData(rightCalendar, 1); // IDs 1-35

    const parsedDates = mainDates.map(dateStr => new Date(dateStr));

    const templateData = parsedDates.map((date) => {
        const dateISOString = date.toISOString();
        return {
            page_id: page_id,
            month_year: date.toLocaleDateString('en-US', { month: 'long' }) + ' ' + year,
            day_number: date.getDate(),
            day_name: date.toLocaleDateString('en-US', { weekday: 'long' }),
            holiday: holidays[dateISOString] || '',
            moon_phase: moonPhases[dateISOString]?.emoji || '',
            // Add calendar data
            left_calendar_month: `${new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' })} ${currentYear}`,
            right_calendar_month: `${new Date(nextMonthYear, nextMonth).toLocaleString('default', { month: 'long' })} ${nextMonthYear}`,
            left_button_data: leftButtonData,
            right_button_data: rightButtonData
        };
    });

    return (
        <TemplateRenderer
            template={template}
            data={templateData}
            components={components}
            page_id={page_id}
            tldraw_snapshots={tldraw_snapshots}
            leftCalendarData={{
                month: `${new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' })} ${currentYear}`,
                buttonData: leftButtonData
            }}
            rightCalendarData={{
                month: `${new Date(nextMonthYear, nextMonth).toLocaleString('default', { month: 'long' })} ${nextMonthYear}`,
                buttonData: rightButtonData
            }}
        />
    );
};

export default WeeklyRight;
import React from 'react';
import MonthlyRenderer from '../monthly/MonthlyRenderer';
import TiptapMonthly from './TiptapMonthly';
import TlDrawComponent from '../TLDrawComponent';

const Monthly = ({
    template,
    page_id,
    month,
    year,
    days,
    holidays,
    moonPhases,
    tldraw_snapshots,
    plannerId
}) => {
    const components = {
        TiptapMonthly: (props) =>
            <TiptapMonthly
                {...props}
                monthId={`${month}_${year}`}
                plannerId={plannerId}
            />,
        TlDrawComponent: () => (
            <TlDrawComponent
                persistenceKey={`monthly-${month}-${year}`}
                plannerId={plannerId}
                tldraw_snapshots={tldraw_snapshots}
            />
        )
    };

    const monthColors = template?.content?.metadata?.default_styles?.["month-colors"] || {};
    const currentMonthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' }).toLowerCase();
    const primaryColor = monthColors[currentMonthName] || '#ffffff';

    // Calculate dates for the monthly grid
    const getMonthlyGridDates = () => {
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const daysInMonth = lastDay.getDate();

        // Get the day of week for the first day (0 = Sunday, 6 = Saturday)
        const firstDayOfWeek = firstDay.getDay();

        // Calculate days from previous month to show
        const daysFromPrevMonth = firstDayOfWeek;
        const prevMonthLastDay = new Date(year, month - 1, 0).getDate();

        // Calculate days from next month to show (always show 42 cells total)
        const totalCells = 42;
        const daysFromNextMonth = totalCells - daysInMonth - daysFromPrevMonth;

        const dates = [];

        // Add days from previous month
        for (let i = daysFromPrevMonth; i > 0; i--) {
            dates.push({
                date: new Date(year, month - 2, prevMonthLastDay - i + 1),
                isCurrentMonth: false
            });
        }

        // Add days from current month
        for (let i = 1; i <= daysInMonth; i++) {
            dates.push({
                date: new Date(year, month - 1, i),
                isCurrentMonth: true
            });
        }

        // Add days from next month
        for (let i = 1; i <= daysFromNextMonth; i++) {
            dates.push({
                date: new Date(year, month, i),
                isCurrentMonth: false
            });
        }

        return dates;
    };

    const gridDates = getMonthlyGridDates();

    const templateData = {
        monthInfo: {
            month_year: new Date(year, month - 1).toLocaleString('en-US', { month: 'long' }) + ' ' + year
        },
        days: gridDates.map((dateObj, index) => ({
            date: dateObj.date,
            day_number: dateObj.date.getDate(),
            isCurrentMonth: dateObj.isCurrentMonth,
            tiptap_id: index + 1
        }))
    };

    return (
        <MonthlyRenderer
            template={template}
            data={templateData}
            components={components}
            page_id={page_id}
            primaryColor={primaryColor}
            tldraw_snapshots={tldraw_snapshots}
            plannerId={plannerId}
        />
    );
};

export default Monthly;
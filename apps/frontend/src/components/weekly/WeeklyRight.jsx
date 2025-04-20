// apps/frontend/src/components/weekly/WeeklyRight.jsx
import React from 'react';
import TemplateRenderer from './TemplateRenderer';
import Tiptap from '../Tiptap';
import TlDrawComponent from '../TLDrawComponent';
import SvgColorizer from '../shared/SvgColorizer';
import PageNavigation from '../PageNavigation';

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

    const weekStartDay = template?.content?.metadata?.default_styles?.["week-start-day"] || "Mon";

    const generateCalendarData = (month, year) => {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const weeks = [];
        let week = [];

        const startDayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekStartDay);
        const firstDayOfWeek = firstDay.getDay();
        let offset = (firstDayOfWeek - startDayIndex + 7) % 7;

        for (let i = 0; i < offset; i++) {
            week.push(null);
        }

        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(year, month, day);
            week.push(date);

            if (week.length === 7) {
                weeks.push(week);
                week = [];
            }
        }

        if (week.length > 0) {
            while (week.length < 7) {
                week.push(null);
            }
            weeks.push(week);
        }

        return weeks;
    };

    const leftCalendar = generateCalendarData(currentMonth, currentYear);
    const rightCalendar = generateCalendarData(nextMonth, nextMonthYear);

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

    const leftButtonData = createButtonData(leftCalendar, 1);
    const rightButtonData = createButtonData(rightCalendar, 1);

    const parsedDates = mainDates.map(dateStr => new Date(dateStr));

    // Get the last day of the week
    const lastDayOfWeek = parsedDates[parsedDates.length - 1];
    const monthColors = template?.content?.metadata?.default_styles?.["month-colors"] || {};
    const currentMonthName = lastDayOfWeek.toLocaleString('en-US', { month: 'long' }).toLowerCase();
    const primaryColor = monthColors[currentMonthName] || '#ffffff';
    const svgPath = template?.content?.metadata?.svgBackground;

    const templateData = [{
        page_id: page_id,
        month_year: lastDayOfWeek.toLocaleDateString('en-US', { month: 'long' }) + ' ' + year,
        day_number: lastDayOfWeek.getDate(),
        day_name: lastDayOfWeek.toLocaleDateString('en-US', { weekday: 'long' }),
        holiday: holidays[lastDayOfWeek.toISOString()] || '',
        moon_phase: moonPhases[lastDayOfWeek.toISOString()]?.emoji || '',
        left_calendar_month: `${new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' })} ${currentYear}`,
        right_calendar_month: `${new Date(nextMonthYear, nextMonth).toLocaleString('default', { month: 'long' })} ${nextMonthYear}`,
        left_button_data: leftButtonData,
        right_button_data: rightButtonData
    }];



    return (
        <TemplateRenderer
            template={template}
            data={templateData}
            components={components}
            page_id={page_id}
            primaryColor={primaryColor}
            tldraw_snapshots={tldraw_snapshots}
            leftCalendarData={{
                month: `${new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' })} ${currentYear}`,
                buttonData: leftButtonData
            }}
            rightCalendarData={{
                month: `${new Date(nextMonthYear, nextMonth).toLocaleString('default', { month: 'long' })} ${nextMonthYear}`,
                buttonData: rightButtonData
            }}
        >
            <SvgColorizer
                svgUrl={`${svgPath}?v=${Date.now()}`}
                primaryColor={primaryColor}
            />
        </TemplateRenderer>
    );
};

export default WeeklyRight;
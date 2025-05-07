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
    tldraw_snapshots,
    plannerId
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

    // Parse dates as UTC to avoid timezone issues
    const parsedDates = mainDates.map(dateStr => {
        const utcDate = new Date(dateStr + 'T00:00:00Z');
        return {
            date: utcDate,
            key: dateStr
        };
    });

    // Get the last day of the week (UTC)
    const lastDayOfWeek = parsedDates[parsedDates.length - 1].date;
    const lastDayKey = lastDayOfWeek.toISOString().split('T')[0];

    // Get month info (UTC)
    const currentMonth = lastDayOfWeek.getUTCMonth();
    const currentYear = lastDayOfWeek.getUTCFullYear();

    // Calculate next month (UTC)
    const nextMonthDate = new Date(Date.UTC(currentYear, currentMonth + 1, 1));
    const nextMonth = nextMonthDate.getUTCMonth();
    const nextMonthYear = nextMonthDate.getUTCFullYear();

    const weekStartDay = template?.content?.metadata?.default_styles?.["week-start-day"] || "Mon";

    const generateCalendarData = (month, year) => {
        const firstDay = new Date(Date.UTC(year, month, 1));
        const lastDay = new Date(Date.UTC(year, month + 1, 0));
        const weeks = [];
        let week = [];

        const startDayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekStartDay);
        const firstDayOfWeek = firstDay.getUTCDay();
        let offset = (firstDayOfWeek - startDayIndex + 7) % 7;

        for (let i = 0; i < offset; i++) {
            week.push(null);
        }

        for (let day = 1; day <= lastDay.getUTCDate(); day++) {
            const date = new Date(Date.UTC(year, month, day));
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
                buttonData[buttonId] = date ? date.getUTCDate() : '';
                buttonId++;
            });
        });

        return buttonData;
    };

    const leftButtonData = createButtonData(leftCalendar, 1);
    const rightButtonData = createButtonData(rightCalendar, 1);

    const monthColors = template?.content?.metadata?.default_styles?.["month-colors"] || {};
    const currentMonthName = lastDayOfWeek.toLocaleString('en-US', {
        month: 'long',
        timeZone: 'UTC'
    }).toLowerCase();
    const primaryColor = monthColors[currentMonthName] || '#ffffff';
    const svgPath = template?.content?.metadata?.svgBackground;

    const templateData = [{
        page_id: page_id,
        month_year: lastDayOfWeek.toLocaleString('en-US', {
            month: 'long',
            timeZone: 'UTC'
        }) + ' ' + lastDayOfWeek.getUTCFullYear(),
        day_number: lastDayOfWeek.getUTCDate(),
        day_name: lastDayOfWeek.toLocaleString('en-US', {
            weekday: 'long',
            timeZone: 'UTC'
        }),
        holiday: holidays[lastDayKey] || '',
        moon_phase: moonPhases[lastDayKey]?.emoji || '',
        left_calendar_month: `${new Date(Date.UTC(currentYear, currentMonth)).toLocaleString('default', {
            month: 'long',
            timeZone: 'UTC'
        })} ${currentYear}`,
        right_calendar_month: `${new Date(Date.UTC(nextMonthYear, nextMonth)).toLocaleString('default', {
            month: 'long',
            timeZone: 'UTC'
        })} ${nextMonthYear}`,
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
            plannerId={plannerId}
            leftCalendarData={{
                month: `${new Date(Date.UTC(currentYear, currentMonth)).toLocaleString('default', {
                    month: 'long',
                    timeZone: 'UTC'
                })} ${currentYear}`,
                buttonData: leftButtonData
            }}
            rightCalendarData={{
                month: `${new Date(Date.UTC(nextMonthYear, nextMonth)).toLocaleString('default', {
                    month: 'long',
                    timeZone: 'UTC'
                })} ${nextMonthYear}`,
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
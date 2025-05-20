// apps/frontend/src/components/weekly/WeeklyRight.jsx
import React from 'react';
import TemplateRenderer from './TemplateRenderer';
import Tiptap from '../Tiptap';
import TlDrawComponent from '../TLDrawComponent';
import SvgColorizer from '../shared/SvgColorizer';

const WeeklyRight = ({
    template,
    page_id,
    weekNumber,
    year,
    tldraw_snapshots,
    plannerId,
    leftCalendar,
    rightCalendar,
    lastDayData,
    daysOrder
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

    const monthColors = template?.content?.metadata?.default_styles?.["month-colors"] || {};
    const currentMonthName = lastDayData?.month_year?.split(' ')[0]?.toLowerCase() || '';
    const primaryColor = monthColors[currentMonthName] || '#ffffff';
    const svgPath = template?.content?.metadata?.svgBackground;

    return (
        <TemplateRenderer
            template={template}
            data={[lastDayData]}
            components={components}
            page_id={page_id}
            primaryColor={primaryColor}
            tldraw_snapshots={tldraw_snapshots}
            plannerId={plannerId}
            leftCalendarData={leftCalendar}
            rightCalendarData={rightCalendar}
            daysOrder={daysOrder} // <-- add this line
        >
            <SvgColorizer
                svgUrl={`${svgPath}?v=${Date.now()}`}
                primaryColor={primaryColor}
            />
        </TemplateRenderer>
    );
};

export default WeeklyRight;
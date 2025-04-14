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
        };
    });

    return (
        <TemplateRenderer
            template={template}
            data={templateData}
            components={components}
            page_id={page_id}
            tldraw_snapshots={tldraw_snapshots}
        />
    );
};

export default WeeklyRight;

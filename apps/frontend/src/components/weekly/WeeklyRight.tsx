import TemplateRenderer from './TemplateRenderer.tsx';
import Tiptap from '../Tiptap.tsx';
import TlDrawComponent from '../TLDrawComponent.tsx';
import SvgColorizer from '../shared/SvgColorizer.tsx';
import type { ComponentMap } from '../templateNodes.ts';
import type { ISODate } from '../../domain/dates.ts';
import type {
    CalendarMonthData,
    SnapshotRecord,
    TemplateRecord,
    WeekDayData,
} from '../../domain/types.ts';

interface WeeklyRightProps {
    template: TemplateRecord;
    page_id: string;
    tldraw_snapshots: SnapshotRecord[];
    plannerId: string;
    leftCalendar: CalendarMonthData;
    rightCalendar: CalendarMonthData;
    lastDayData: WeekDayData;
    daysOrder: string[];
    nextWeekId: string;
    prevWeekId: string;
    weekStart: ISODate;
}

const WeeklyRight = ({
    template,
    page_id,
    tldraw_snapshots,
    plannerId,
    leftCalendar,
    rightCalendar,
    lastDayData,
    daysOrder,
    nextWeekId,
    prevWeekId,
    weekStart
}: WeeklyRightProps) => {
    const components: ComponentMap = {
        Tiptap,
        TlDrawComponent: () => (
            <TlDrawComponent
                pageId={page_id}
                tldraw_snapshots={tldraw_snapshots}
            />
        )
    };

    const monthColors = (template?.content?.metadata?.default_styles?.["month-colors"] || {}) as Record<string, string>;
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
            daysOrder={daysOrder}
            nextWeekId={nextWeekId}
            prevWeekId={prevWeekId}
            defaultEntryDate={weekStart}
        >
            <SvgColorizer
                svgUrl={`${svgPath}?v=${Date.now()}`}
                primaryColor={primaryColor}
            />
        </TemplateRenderer>
    );
};

export default WeeklyRight;

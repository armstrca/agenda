import Tiptap from "../Tiptap.tsx";
import TlDrawComponent from "../TLDrawComponent.tsx";
import TemplateRenderer from "./TemplateRenderer.tsx";
import SvgColorizer from "../shared/SvgColorizer.tsx";
import type { ComponentMap } from "../templateNodes.ts";
import { monthName, type ISODate } from "../../domain/dates.ts";
import type { SnapshotRecord, TemplateRecord, WeekDayData } from "../../domain/types.ts";

interface WeeklyLeftProps {
  template: TemplateRecord;
  page_id: string;
  templateData: WeekDayData[];
  tldraw_snapshots: SnapshotRecord[];
  plannerId: string;
  nextWeekId: string;
  prevWeekId: string;
  weekStart: ISODate;
}

const WeeklyLeft = ({
  template,
  page_id,
  templateData,
  tldraw_snapshots,
  plannerId,
  nextWeekId,
  prevWeekId,
  weekStart
}: WeeklyLeftProps) => {
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
  // Month of the first day shown, read from the ISO date (not via new Date(string), which is UTC
  // and lands on the previous month in the Americas when the week starts on the 1st).
  const firstDay = templateData?.[0]?.entryDate;
  const currentMonthName = firstDay ? monthName(firstDay).toLowerCase() : '';
  const primaryColor = monthColors[currentMonthName] || '#ffffff';
  const svgPath = template?.content?.metadata?.svgBackground;

  return (
    <TemplateRenderer
      template={template}
      data={templateData}
      components={components}
      page_id={page_id}
      primaryColor={primaryColor}
      tldraw_snapshots={tldraw_snapshots}
      plannerId={plannerId}
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

export default WeeklyLeft;

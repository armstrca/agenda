import Tiptap from "../Tiptap.tsx";
import TlDrawComponent from "../TLDrawComponent.tsx";
import DailyRenderer from "./DailyRenderer.tsx";
import SvgColorizer from "../shared/SvgColorizer.tsx";
import type { ComponentMap } from "../templateNodes.ts";
import { monthName } from "../../domain/dates.ts";
import type { DayData, SnapshotRecord, TemplateRecord } from "../../domain/types.ts";

interface DailyProps {
  template: TemplateRecord;
  page_id: string;
  dayData: DayData;
  tldraw_snapshots: SnapshotRecord[];
  plannerId: string;
}

const Daily = ({
  template,
  page_id,
  dayData,
  tldraw_snapshots,
  plannerId
}: DailyProps) => {
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
  // Read from the ISO date rather than new Date(string), which is UTC and can land on the day before.
  const currentMonthName = dayData?.entryDate ? monthName(dayData.entryDate).toLowerCase() : '';
  const primaryColor = monthColors[currentMonthName] || '#ffffff';
  const svgPath = template?.content?.metadata?.svgBackground;

  return (
    <DailyRenderer
      template={template}
      data={dayData}
      components={components}
      page_id={page_id}
      primaryColor={primaryColor}
      tldraw_snapshots={tldraw_snapshots}
      plannerId={plannerId}
    >
      <SvgColorizer
        svgUrl={`${svgPath}?v=${Date.now()}`}
        primaryColor={primaryColor}
      />
    </DailyRenderer>
  );
};

export default Daily;

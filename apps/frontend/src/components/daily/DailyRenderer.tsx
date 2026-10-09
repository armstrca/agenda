import React, { useRef } from 'react';
import Tiptap from '../Tiptap.tsx';
import TlDrawComponent from '../TLDrawComponent.tsx';
import PageNavigation from '../PageNavigation.tsx';
import { MonthLink } from '../shared/PageLinks.tsx';
import { templateStructure, type ComponentMap, type TemplateNode } from '../templateNodes.ts';
import { hourLabel } from '../../domain/calendar/days.ts';
import type { DayData, SnapshotRecord, TemplateRecord } from '../../domain/types.ts';

interface RenderContext {
  /** 0 … 23, set by the enclosing d-hour-section. */
  hour?: number;
}

interface DailyRendererProps {
  template: TemplateRecord;
  data: DayData;
  components: ComponentMap;
  page_id: string;
  plannerId: string;
  primaryColor?: string;
  tldraw_snapshots: SnapshotRecord[];
  children?: React.ReactNode;
}

const DailyRenderer = ({
  template,
  data,
  components,
  page_id,
  plannerId,
  tldraw_snapshots,
  children
}: DailyRendererProps) => {
  const structure = templateStructure(template?.content);
  const keyCounter = useRef(0);

  const renderComponent = (node: TemplateNode, context: RenderContext = {}): React.ReactNode => {
    const {
      component,
      class: className = '',
      children,
      component_type,
      component_props,
      attributes = {},
      styles = {},
    } = node;

    const Component = (component_type ? components[component_type] : component) as React.ElementType;
    const uniqueKey = `${component}-${keyCounter.current++}`;

    let textContent: React.ReactNode = null;
    if (className === "d-month-name") {
      textContent = (
        <MonthLink plannerId={plannerId} date={data?.entryDate}>
          {data?.month_year || ''}
        </MonthLink>
      );
    }
    if (className === "d-day-number") textContent = data?.day_number;
    if (className === "d-day-name") textContent = data?.day_name;
    if (className === "moon-phase") textContent = data?.moon_phase;
    if (className === "holiday-box") textContent = (data?.holidays || []).join(', ');
    if (className === "d-hour-label" && context.hour !== undefined) textContent = hourLabel(context.hour);

    const newContext: RenderContext = { ...context };
    if (className === "d-hour-section") newContext.hour = Number(attributes['data-hour']);

    // One editor per hour; the slot is the hour + 1 so it stays put if the template is reordered.
    if (className.includes("tiptap") && context.hour !== undefined) {
      return (
        <Tiptap
          key={uniqueKey}
          tiptap_id={String(context.hour + 1)}
          pageId={page_id}
          className={className}
          entryDate={data?.entryDate}
        />
      );
    }

    return (
      <Component
        key={uniqueKey}
        className={className}
        style={styles}
        {...attributes}
        {...component_props}
      >
        {textContent !== null && textContent}
        {children?.map((child) => renderComponent(child, newContext))}
      </Component>
    );
  };

  return (
    <>
      <PageNavigation plannerId={plannerId} nextDayId={data?.nextDayId} prevDayId={data?.prevDayId} />
      {children}
      <TlDrawComponent pageId={page_id} tldraw_snapshots={tldraw_snapshots} />
      {structure.map((node) => (
        <React.Fragment key={`fragment-${keyCounter.current++}`}>
          {renderComponent(node)}
        </React.Fragment>
      ))}
    </>
  );
};

export default DailyRenderer;

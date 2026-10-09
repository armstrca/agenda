import React, { useRef } from 'react';
import TiptapMonthly from './TiptapMonthly.tsx';
import TlDrawComponent from '../TLDrawComponent.tsx';
import PageNavigation from '../PageNavigation.tsx';
import { templateStructure, type ComponentMap, type TemplateNode } from '../templateNodes.ts';
import type { SnapshotRecord, TemplateRecord } from '../../domain/types.ts';

/** One of the 42 cells of the month grid. */
export interface MonthDay {
  date: Date;
  day_number: number;
  isCurrentMonth: boolean;
  tiptap_id: number;
}

export interface MonthTemplateData {
  monthInfo: { month_year: string };
  days: MonthDay[];
}

interface MonthlyRendererProps {
  template: TemplateRecord;
  data: MonthTemplateData;
  components: ComponentMap;
  page_id: string;
  plannerId: string;
  primaryColor?: string;
  tldraw_snapshots: SnapshotRecord[];
  children?: React.ReactNode;
}

const MonthlyRenderer = ({
  template,
  data,
  components,
  page_id,
  tldraw_snapshots,
  children
}: MonthlyRendererProps) => {
  const structure = templateStructure(template?.content);
  const keyCounter = useRef(0);

  const weekStartDay = (template?.content?.metadata?.default_styles?.["week-start-day"] as string | undefined) || "Mon";

  const daysOrder = React.useMemo(() => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const startIndex = days.findIndex(day => day.startsWith(weekStartDay));
    return startIndex === -1 ? days : [
      ...days.slice(startIndex),
      ...days.slice(0, startIndex)
    ].slice(0, 7);
  }, [weekStartDay]);

  const renderComponent = (node: TemplateNode): React.ReactNode => {
    const {
      component,
      class: className = '',
      children,
      component_type,
      attributes = {},
      styles = {},
    } = node;

    const Component = (component_type ? components[component_type] : component) as React.ElementType;
    const uniqueKey = `${component}-${keyCounter.current++}`;

    if (className === "month-name") {
      return (
        <div key={uniqueKey} className={className} style={styles}>
          {data?.monthInfo?.month_year || ''}
        </div>
      );
    }

    if (className === "monthly-week-header") {
      return (
        <section key={uniqueKey} className={className} style={styles}>
          {daysOrder.map((day, index) => (
            <div key={`day-${index}`}>{day}</div>
          ))}
        </section>
      );
    }

    if (component === "TiptapMonthly") {
      const dayData: Partial<MonthDay> = data?.days?.[Number(attributes.tiptap_id) - 1] || {};
      return (
        <TiptapMonthly
          key={uniqueKey}
          tiptap_id={attributes.tiptap_id}
          pageId={page_id}
          className={className}
          date={dayData.date}
          isCurrentMonth={dayData.isCurrentMonth}
        />
      );
    }

    return (
      <Component
        key={uniqueKey}
        className={className}
        style={styles}
        {...attributes}
      >
        {children?.map((child) => renderComponent(child))}
      </Component>
    );
  };

  return (
    <>
      {children}
      <PageNavigation />
      <TlDrawComponent pageId={page_id} tldraw_snapshots={tldraw_snapshots} />
      {structure.map((node) => (
        <React.Fragment key={`fragment-${keyCounter.current++}`}>
          {renderComponent(node)}
        </React.Fragment>
      ))}
    </>
  );
};

export default MonthlyRenderer;

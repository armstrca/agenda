import React, { useRef, useEffect } from 'react';
import Tiptap from '../Tiptap.tsx';
import TlDrawComponent from '../TLDrawComponent.tsx';
import chroma from 'chroma-js';
import PageNavigation from '../PageNavigation.tsx';
import { templateStructure, type ComponentMap, type TemplateNode } from '../templateNodes.ts';
import type { ISODate } from '../../domain/dates.ts';
import type {
  CalendarMonthData,
  SnapshotRecord,
  TemplateRecord,
  WeekDayData,
} from '../../domain/types.ts';

const VOID_ELEMENTS = new Set([
  'img', 'br', 'hr', 'input', 'meta', 'link', 'area',
  'base', 'col', 'embed', 'param', 'source', 'track', 'wbr',
]);

/** One day's data as the template reads it. `holiday` is only used by the legacy monthly cell. */
type DayData = Partial<WeekDayData> & { holiday?: string };

interface RenderContext {
  dayIndex?: number;
  calendarSide?: 'left' | 'right';
}

interface TemplateRendererProps {
  template: TemplateRecord;
  data: DayData[];
  components: ComponentMap;
  page_id: string;
  tldraw_snapshots: SnapshotRecord[];
  plannerId: string;
  leftCalendarData?: CalendarMonthData;
  rightCalendarData?: CalendarMonthData;
  primaryColor?: string;
  daysOrder?: string[];
  nextWeekId?: string;
  prevWeekId?: string;
  /** Entry date for editors that are not inside a day section (the right page's free text boxes). */
  defaultEntryDate?: ISODate;
  children?: React.ReactNode;
}

const TemplateRenderer = ({
  template,
  data,
  components,
  page_id,
  tldraw_snapshots,
  plannerId,
  leftCalendarData,
  rightCalendarData,
  primaryColor,
  daysOrder,
  nextWeekId,
  prevWeekId,
  defaultEntryDate,
  children
}: TemplateRendererProps) => {
  const structure = templateStructure(template?.content);
  const keyCounter = useRef(0);
  const dayIndexRef = useRef(0);
  const tiptapCounter = useRef(1);

  useEffect(() => {
    tiptapCounter.current = 1;
  }, [data]);

  const colors = React.useMemo<Record<string, string>>(() => {
    if (!primaryColor) {
      return {
        primary: '#000',
        secondary: '#222',
        ternary: '#333',
        quaternary: '#444',
      };
    }

    return {
      primary: primaryColor,
      secondary: chroma.mix('#fff', primaryColor, 0.15).hex(),
      ternary: chroma.mix('#fff', primaryColor, 0.05).hex(),
      quaternary: chroma(primaryColor).darken(0.3).hex()
    };
  }, [primaryColor]);

  dayIndexRef.current = 0;

  const renderComponent = (
    node: TemplateNode,
    currentData: DayData | undefined,
    context: RenderContext = { dayIndex: 0 },
  ): React.ReactNode => {
    const {
      component,
      class: className = '',
      children,
      component_type,
      component_props,
      attributes = {},
      styles = {},
      selfClosing,
    } = node;

    const Component = (component_type ? components[component_type] : component) as React.ElementType;
    const isVoidElement = VOID_ELEMENTS.has(component);
    const uniqueKey = `${component}-${keyCounter.current++}`;

    let textContent: React.ReactNode = null;
    if (className === "month-name") {
      textContent = currentData?.month_year || data?.[0]?.month_year || '';
    }
    else if (className === "week-days") {
      const dayId = parseInt(node.attributes?.id, 10);
      if (dayId >= 1 && dayId <= 7) {
        textContent = daysOrder?.[dayId - 1] || '';
      }

    } else if (currentData) {
      if (className === "monthly-day-cell-date") {
        textContent = currentData.day_number;
      }
      if (className === "day-number") textContent = currentData?.day_number;
      if (className === "day-name") textContent = currentData?.day_name;
      if (className === "holiday-box") {
        textContent = (currentData?.holidays || []).join(', ');
      }
      if (className === "moon-phase") textContent = currentData?.moon_phase;
    }

    if (selfClosing || isVoidElement) {
      return React.createElement(Component, {
        key: uniqueKey,
        className,
        style: styles,
        ...attributes,
      });
    }
    const newContext: RenderContext = { ...context };

    if (className === "monthly-day-cell") {
      const dayNumber = currentData?.day_number;
      const isEmptyCell = !dayNumber;

      return (
        <Component
          key={uniqueKey}
          className={className}
          style={styles}
          {...attributes}
        >
          {!isEmptyCell && (
            <>
              <div className="day-number">{dayNumber}</div>
              {currentData?.holiday && (
                <div className="holiday-box">{currentData.holiday}</div>
              )}
              {currentData?.moon_phase && (
                <div className="moon-phase">{currentData.moon_phase}</div>
              )}
              {children?.map((child) => renderComponent(child, currentData))}
            </>
          )}
        </Component>
      );
    }

    if (className === "wl-day-section" || className === "wr-day-section") {
      const dayIndex = dayIndexRef.current++;
      const dayData: DayData = data[dayIndex] || {};
      return (
        <Component
          key={`${className}-${dayIndex}`}
          className={className}
          style={styles}
          {...attributes}
          {...component_props}
        >
          {children?.map((child) => renderComponent(child, dayData))}
        </Component>
      );
    }

    if (className === "wr-cal-left") newContext.calendarSide = "left";
    if (className === "wr-cal-right") newContext.calendarSide = "right";

    if (className === "wr-calendar-button") {
      const buttonId = parseInt(node.attributes?.id, 10);
      const calendarData = newContext.calendarSide === "left"
        ? leftCalendarData
        : rightCalendarData;
      const buttonText = calendarData?.buttonData?.[buttonId] || '';

      return React.createElement(Component, {
        key: uniqueKey,
        className,
        style: styles,
        ...attributes,
        ...component_props,
      }, buttonText);
    }

    if (className === "month-year") {
      const calendarData = newContext.calendarSide === "left"
        ? leftCalendarData
        : rightCalendarData;
      const monthText = calendarData?.month || '';

      return React.createElement(Component, {
        key: uniqueKey,
        className,
        style: styles,
        ...attributes,
      }, monthText);
    }


    if (className.includes("tiptap")) {
      const tiptapId = tiptapCounter.current++;
      return (
        <Tiptap
          key={uniqueKey}
          tiptap_id={tiptapId.toString()}
          pageId={page_id}
          className={className}
          entryDate={currentData?.entryDate ?? defaultEntryDate}
        />
      );
    }

    if (node.component === 'Tiptap') {
      return (
        <Component
          key={uniqueKey}
          tiptap_id={node.attributes?.tiptap_id}
          pageId={page_id}
          className={className}
        />
      );
    }

    const attrs: Record<string, string> = { ...node.attrs };
    if (attrs['data-color']) {
      const colorType = attrs['data-color'];
      const color = colors[colorType] || '#000';

      if (node.component === 'path') {
        attrs.stroke = color;
        attrs.fill = color;
      }
      if (node.component === 'rect') {
        attrs.fill = color;
      }
      return React.createElement(
        Component,
        {
          key: uniqueKey,
          className,
          style: styles,
          ...attrs,
          ...component_props
        }
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
        {children?.map((child) => renderComponent(child, currentData, newContext))}
      </Component>
    );
  };

  return (
    <>
      <PageNavigation plannerId={plannerId} nextWeekId={nextWeekId} prevWeekId={prevWeekId} />
      {children}
      <TlDrawComponent
        pageId={page_id}
        tldraw_snapshots={tldraw_snapshots}
      />
      {structure.map((node) => (
        <React.Fragment key={`fragment-${keyCounter.current++}`}>
          {renderComponent(node, undefined)}
        </React.Fragment>
      ))}
    </>
  );
};

export default TemplateRenderer;

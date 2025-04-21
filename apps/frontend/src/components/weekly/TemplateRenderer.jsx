import React, { useRef, useEffect } from 'react';
import Tiptap from '../Tiptap';
import TlDrawComponent from '../TLDrawComponent';
import chroma from 'chroma-js';
import PageNavigation from '../PageNavigation';

const VOID_ELEMENTS = new Set([
  'img', 'br', 'hr', 'input', 'meta', 'link', 'area',
  'base', 'col', 'embed', 'param', 'source', 'track', 'wbr',
]);

const TemplateRenderer = ({
  template,
  data,
  components,
  page_id,
  tldraw_snapshots,
  leftCalendarData,
  rightCalendarData,
  primaryColor,
  children
}) => {
  const structure = template?.content?.structure || [];
  const keyCounter = useRef(0);
  const dayIndexRef = useRef(0);
  const tiptapCounter = useRef(1);

  // Get week start from template metadata
  const weekStartDay = template?.content?.metadata?.default_styles?.["week-start-day"] || "Mon";

  // Generate day order based on week start
  const daysOrder = React.useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const startIndex = days.indexOf(weekStartDay);
    return startIndex === -1 ? days : [
      ...days.slice(startIndex),
      ...days.slice(0, startIndex)
    ].slice(0, 7);
  }, [weekStartDay]);

  useEffect(() => {
    dayIndexRef.current = 0;
    tiptapCounter.current = 1;
  }, [data]);

  const colors = React.useMemo(() => {
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

  const renderComponent = (node, currentData, context = {}) => {
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

    const Component = component_type ? components[component_type] : component;
    const isVoidElement = VOID_ELEMENTS.has(component);
    const uniqueKey = `${component}-${keyCounter.current++}`;

    let textContent = null;
    if (className === "month-name") {
      textContent = currentData?.month_year || data?.[0]?.month_year || '';
    } else if (className === "week-days") {
      const dayId = parseInt(node.attributes?.id, 10);
      if (dayId >= 1 && dayId <= 7) {
        textContent = daysOrder[dayId - 1]?.charAt(0) || '';
      }
    } else if (currentData) {
      if (className === "day-number") textContent = currentData.day_number;
      if (className === "day-name") textContent = currentData.day_name;
      if (className === "holiday-box") textContent = currentData.holiday;
      if (className === "moon-phase") textContent = currentData.moon_phase;
    }

    if (selfClosing || isVoidElement) {
      return React.createElement(Component, {
        key: uniqueKey,
        className,
        style: styles,
        ...attributes,
      });
    }
    let newContext = { ...context };

    if (className === "wl-day-section" || className === "wr-day-section") {
      const dayData = data[dayIndexRef.current] || {};
      dayIndexRef.current++;
      return (
        <Component
          key={uniqueKey}
          className={className}
          style={styles}
          {...attributes}
          {...component_props}
        >
          {children?.map((child) => renderComponent(child, dayData, newContext))}
        </Component>
      );
    }

    if (className === "wr-cal-left") newContext.calendarSide = "left";
    if (className === "wr-cal-right") newContext.calendarSide = "right";

    if (className === "wr-calendar-button") {
      const buttonId = parseInt(node.attributes?.id, 10); // Convert to number
      const calendarData = newContext.calendarSide === "left"
        ? leftCalendarData
        : rightCalendarData;
      const buttonText = calendarData?.buttonData?.[buttonId] || ''; // Now using numeric key

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
          tiptap_id={tiptapId}
          pageId={page_id}
          className={className}
        />
      );
    }

    const attrs = { ...node.attrs };
    if (attrs && attrs['data-color']) {
      const colorType = attrs['data-color'];
      const color = colors[colorType] || '#000';

      if (node.component === 'path') {
        attrs.stroke = color;
        attrs.fill = color; // Or conditionally set based on element type
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
          ...attrs, // Use modified attributes
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
    <div className="planner-container">
      <>
        <PageNavigation />
      </>
      {children}
      <TlDrawComponent
        persistenceKey={page_id}
        tldraw_snapshots={tldraw_snapshots}
        plannerId="38e012ec-0ab2-4fbe-8e68-8a75e4716a35"
      />
      {structure.map((node) => (
        <React.Fragment key={`fragment-${keyCounter.current++}`}>
          {renderComponent(node, undefined, {})}
        </React.Fragment>
      ))}
    </div>
  );
};

export default TemplateRenderer;
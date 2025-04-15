import React, { useRef, useEffect } from 'react';
import Tiptap from '../Tiptap';
import TlDrawComponent from '../TLDrawComponent';

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
  rightCalendarData
}) => {
  const structure = template?.content?.structure || [];
  const keyCounter = useRef(0);
  const dayIndexRef = useRef(0);
  const tiptapCounter = useRef(1);

  useEffect(() => {
    dayIndexRef.current = 0;
    tiptapCounter.current = 1;
  }, [data]);

  const renderComponent = (node, currentData, context = {}) => {
    const {
      component,
      class: className,
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
      const buttonId = node.attributes?.id;
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
          tiptap_id={tiptapId}
          pageId={page_id}
          className={className}
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
        {children?.map((child) => renderComponent(child, currentData, newContext))}
      </Component>
    );
  };

  return (
    <div className="planner-container">
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
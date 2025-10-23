import React, { useRef } from 'react';
import TiptapMonthly from './TiptapMonthly';
import chroma from 'chroma-js';
import PageNavigation from '../PageNavigation';

const MonthlyRenderer = ({
  template,
  data,
  components,
  page_id,
  plannerId,
  primaryColor,
  children
}) => {
  const structure = template?.content?.structure || [];
  const keyCounter = useRef(0);

  const weekStartDay = template?.content?.metadata?.default_styles?.["week-start-day"] || "Mon";

  const daysOrder = React.useMemo(() => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const startIndex = days.findIndex(day => day.startsWith(weekStartDay));
    return startIndex === -1 ? days : [
      ...days.slice(startIndex),
      ...days.slice(0, startIndex)
    ].slice(0, 7);
  }, [weekStartDay]);

  const renderComponent = (node, currentData, context = {}) => {
    const {
      component,
      class: className = '',
      children,
      component_type,
      attributes = {},
      styles = {},
    } = node;

    const Component = component_type ? components[component_type] : component;
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
      const dayData = data?.days?.[attributes.tiptap_id - 1] || {};
      return (
        <TiptapMonthly
          key={uniqueKey}
          tiptap_id={attributes.tiptap_id}
          pageId={page_id}
          className={className}
          date={dayData.date}
          isCurrentMonth={dayData.isCurrentMonth}
          plannerId={plannerId}
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
        {children?.map((child) => renderComponent(child, currentData, context))}
      </Component>
    );
  };

  return (
    <>
      {children}
      <PageNavigation />
      {structure.map((node) => (
        <React.Fragment key={`fragment-${keyCounter.current++}`}>
          {renderComponent(node, undefined, {})}
        </React.Fragment>
      ))}
    </>
  );
};

export default MonthlyRenderer;
// import TlDrawComponent from "../TLDrawComponent";
import TemplateRenderer from "./TemplateRenderer";
import SvgColorizer from "../shared/SvgColorizer";

const WeeklyLeft = ({
  template,
  page_id,
  weekNumber,
  year,
  mainDates,
  holidays,
  moonPhases,
  endDate,
  tldraw_snapshots,
  plannerId
}) => {
  const components = {
    Tiptap: (props) => 
    <Tiptap {...props} 
    weekId={`${weekNumber}_${year}_l`}
    />,
    TlDrawComponent: () => (
      <TlDrawComponent
        persistenceKey={`weekly-${weekNumber}-${year}-l`}
        plannerId={plannerId}
        tldraw_snapshots={tldraw_snapshots}
      />
    )
  };

  const weekStart = new Date(mainDates[0]);
  const monthColors = template?.content?.metadata?.default_styles?.["month-colors"] || {};
  const currentMonthName = weekStart.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  const primaryColor = monthColors[currentMonthName] || '#ffffff';
  const svgPath = template?.content?.metadata?.svgBackground;

  const templateData = mainDates.map(dateStr => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return {
      page_id: page_id,
      month_year: date.toLocaleDateString('en-US', { month: 'long' }) + ' ' + year,
      day_number: date.getDate(),
      day_name: date.toLocaleDateString('en-US', { weekday: 'long' }),
      holiday: holidays[dateStr] || "",
      moon_phase: moonPhases[dateStr]?.emoji || "",
    };
  });

  return (
    <TemplateRenderer
      template={template}
      data={templateData}
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
    </TemplateRenderer>
  );
};

export default WeeklyLeft;
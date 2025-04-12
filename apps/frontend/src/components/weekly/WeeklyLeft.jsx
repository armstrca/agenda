// import TlDrawComponent from "../TLDrawComponent";
import TemplateRenderer from "./TemplateRenderer";

const WeeklyLeft = ({
  template,
  weekNumber,
  year,
  mainDates,
  holidays,
  moonPhases
}) => {
  const components = {
    Tiptap: (props) => <Tiptap {...props} weekId={`${weekNumber}_${year}`} />,
    TlDrawComponent: () => <TlDrawComponent persistenceKey={`weekly-${weekNumber}-${year}`} />
  };

  const parsedDates = mainDates.map(dateStr => new Date(dateStr));
  
  const templateData = parsedDates.map((date) => {
    const dateISOString = date.toISOString();
    return {
      month_year: date.toLocaleDateString('en-US', { month: 'long' }) + ' ' + year,
      day_number: date.getDate(),
      day_name: date.toLocaleDateString('en-US', { weekday: 'long' }),
      holiday: holidays[dateISOString] || '',
      moon_phase: moonPhases[dateISOString]?.emoji || '',
    };
  });

  return (
        <TemplateRenderer
          template={template}
          data={templateData}
          components={components}
        />
  );
};

export default WeeklyLeft;
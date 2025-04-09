import { createFileRoute } from '@tanstack/react-router';
import WeeklyLeft from '../components/weekly/WeeklyLeft';

export const Route = createFileRoute('/weekly/$weekId')({
  loader: async ({ params }: { params: { weekId: string; plannerId: string } }) => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/planners/38e012ec-0ab2-4fbe-8e68-8a75e4716a35/pages?week_id=${params.weekId}&page_type=weekly`
      );
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error('Failed to fetch weekly page data');
      }
      const data = await response.json();
      console.log('Backend Response:', data);
      return { params, data };
    } catch (error) {
      console.error('Error fetching weekly page data:', error);
      return { params, data: null };
    }
  },

  component: ({ loaderData }) => {
    const { weekId } = loaderData?.params;
    const [weekNumber, year]: [string, string] = weekId.split('_').map((part: string) => part || '0');

    // Merge API data with defaults using nullish coalescing
    const apiData = loaderData?.data ?? {};
    const data = { ...apiData };

    return (
      <div className="planner-container">
        <WeeklyLeft
          weekNumber={weekNumber}
          year={parseInt(year, 10)}
          displayMonthYear={data.displayMonthYear}
          mainDates={data.mainDates}
          holidays={data.holidays}
          moonPhases={data.moonPhases}
        />
      </div>
    );
  },
});

// WeeklyTemplateRenderer Component
// function WeeklyTemplateRenderer({ template, data }: { template: any; data: any }) {
//   return (
//     <div className={template.content.structure.container_classes}>
//       {template.content.structure.sections.map((section: any) => (
//         <section key={section.type} className={section.classes}>
//           {section.type === 'header' && (
//             <div dangerouslySetInnerHTML={{
//               __html: section.content.replace('{{displayMonthYear}}', data.displayMonthYear)
//             }} />
//           )}

//           {section.type === 'days_grid' && (
//             <div className={section.classes}>
//               {data.mainDates.map((date: string) => (
//                 <div key={date} className={section.daily_sections[0].classes}>
//                   {section.daily_sections[0].elements.map((element: any) => (
//                     <TemplateElement
//                       key={element.type}
//                       element={element}
//                       date={date}
//                       data={data}
//                     />
//                   ))}
//                 </div>
//               ))}
//             </div>
//           )}
//         </section>
//       ))}
//     </div>
//   );
// }

// // SectionRenderer Component
// function SectionRenderer({ section, data }: { section: any; data: any }) {
//   switch (section.type) {
//     case 'header':
//       return (
//         <div className={section.classes}>
//           {section.content.replace('{{displayMonthYear}}', data.displayMonthYear || 'March 2025')}
//         </div>
//       );
//     case 'days_grid':
//       return (
//         <div className={section.classes}>
//           {data.mainDates?.map((date: string, index: number) => (
//             <div key={index} className={section.daily_sections[0]?.classes}>
//               {section.daily_sections[0]?.elements.map((element: any, elementIndex: number) => (
//                 <TemplateElement
//                   key={elementIndex}
//                   element={element}
//                   date={date}
//                   data={data}
//                 />
//               ))}
//             </div>
//           ))}
//         </div>
//       );
//     default:
//       return null;
//   }
// }

// // TemplateElement Component
// function TemplateElement({ element, date, data }: { element: any; date: string; data: any }) {
//   // Use original date string for lookups
//   const dateString = date; // Already in "YYYY-MM-DD" format
//   const dateObj = new Date(dateString);

//   switch (element.type) {
//     case 'day_number':
//       return <div className={element.classes}>{dateObj.getDate()}</div>;
//     case 'day_name':
//       return <div className={element.classes}>
//         {dateObj.toLocaleDateString('en-US', { weekday: 'long' })}
//       </div>;
//     case 'holiday_box':
//       return <div className={element.classes}>{data.holidays?.[dateString] || ''}</div>;
//     case 'moon_phase':
//       return <div className={element.classes}>
//         {data.moonPhases?.[dateString]?.emoji || ''}
//       </div>;
//     case 'textarea_container':
//       return (
//         <div className={element.classes}>
//           {Array.from({ length: element.lines }).map((_, lineIndex) => (
//             <img key={lineIndex} src={element.line_src} alt="line" />
//           ))}
//         </div>
//       );
//     default:
//       return null;
//   }
// }

import React from 'react';
import '../../styles/styles.css';
import TlDrawComponent from '../TLDrawComponent';
import WLTextareaContainer from './WLTextareaContainer';
import WLTextareaContainer2 from './WLTextareaContainer2';

export default function WeeklyLeft({
  weekNumber,
  year,
  displayMonthYear,
  mainDates,
  holidays,
  moonPhases,
}) {
  return (
    <div className="planner-container" data-week-id={`${weekNumber}_${year}`}>
      <TlDrawComponent />
      <div className="month-name">{displayMonthYear}</div>
      <div className="header-footer">
        {mainDates.map((date, index) => {
          const dateObj = new Date(date);
          const dateKey = dateObj.toISOString().split('T')[0];
          const isSaturday = dateObj.getDay() === 6; 
          const dayNumber = index + 1 

          return (
            <div
              key={index}
              className="w-l-day-section"
              style={{ top: `${90 + index * 210}px` }}
            >
              <div className="day-inner-block">
                <div className="day-number-circle">
                  <div className="day-number">{dateObj.getDate()}</div>
                </div>
                <div className="day-name">
                  {dateObj.toLocaleDateString('en-US', { weekday: 'long' })}
                </div>
                <div className="holiday-box">{holidays[dateKey]}</div>
                <div
                  className="moon-phase"
                  aria-label={moonPhases[dateKey]?.ariaLabel}
                  title={moonPhases[dateKey]?.alt}
                >
                  {moonPhases[dateKey]?.emoji}
                </div>
              </div>

              {/* Render different container based on day */}
              {isSaturday ? (
                <WLTextareaContainer2 id={6} />
              ) : (
                  <WLTextareaContainer id={dayNumber} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
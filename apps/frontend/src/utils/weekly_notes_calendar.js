
document.addEventListener('DOMContentLoaded', function () {
  const textInputs = document.querySelectorAll('.grey-line');

  textInputs.forEach((textInput, index) => {
    textInput.addEventListener('keypress', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault(); // Prevent the default behavior (e.g., newline in textarea)

        // Find the next text input
        const nextIndex = (index + 1) % textInputs.length;
        const nextTextInput = textInputs[nextIndex];

        // Focus on the next text input
        nextTextInput.focus();
      }
    });
  });
});
const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function generateCalendar(month, year, targetId) {
  const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const date = new Date(year, monthNames.indexOf(month), 1);
  const endDate = new Date(year, monthNames.indexOf(month) + 1, 0);
  const calendar = document.getElementById(targetId);
  calendar.innerHTML = '';

  // Add month name
  const monthCell = document.createElement('div');
  monthCell.className = 'calendar-cell calendar-header col-span-7';
  monthCell.textContent = monthNames[date.getMonth()];
  calendar.appendChild(monthCell);

  // Add line below the month name
  const monthLine = document.createElement('div');
  monthLine.className = 'calendar-line calendar-header col-span-7';
  calendar.appendChild(monthLine);

  // Add day names
  dayNames.forEach((day) => {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-cell calendar-header';
    dayCell.textContent = day;
    calendar.appendChild(dayCell);
  });

  // Add line below the weekdays
  const weekdayLine = document.createElement('div');
  weekdayLine.className = 'calendar-line calendar-header col-span-7';
  calendar.appendChild(weekdayLine);

  // Add empty cells before the first day of the month
  for (let i = 0; i < date.getDay(); i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-cell';
    calendar.appendChild(emptyCell);
  }

  // Add days of the month
  for (let i = 1; i <= endDate.getDate(); i++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-cell';
    dayCell.textContent = i;
    calendar.appendChild(dayCell);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  // Get the current date
  const currentDate = new Date();
  const currentMonth = currentDate.toLocaleString('en-US', {
    month: 'long',
  });
  const currentYear = currentDate.getFullYear();

  // Replace the left-side calendar with the current month (January)
  generateCalendar(currentMonth, currentYear, 'calendar');

  // Determine the next month dynamically
  const nextMonthIndex = (currentDate.getMonth() + 1) % 12;
  const nextMonth = monthNames[nextMonthIndex];

  // Generate the calendar for the next month
  generateCalendar(nextMonth, currentYear, 'calendar2');
});

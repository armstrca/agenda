# To Do

## Mandatory ASAP

- Preset template options (start with 960x1440px ratio)
- Blank template pages with drag and drop options
- User profiles
- Each calendar cell needs to function as a link to that day's weekly or daily page, allow for event creation, and show existing events
- Match monthly color logic between monthly/weekly/daily pages
- ~~Convert .jsx files to .tsx files wherever possible~~
- ~~TLDRaw is now implemented, but need to make sure regular typing functionality of original setup is preserved~~
- ~~Figure out what the models even are, NBD~~
- ~~Need to make sure canvas/TLDraw UI is always the same size as page content so that shapes/scribbles will always maintain position relative to page content~~
- ~~Automatically save all user input~~
- ~~Be able to draw/write on top of anything, including existing text areas~~
- ~~Need code to be modular to allow for a full year's worth of content, especially for daily pages, but storage and memory have to be as light as possible~~
- ~~Figure out if daily & weekly pages are gonna actually definitely be made out of HTML & React & such or if they're partially gonna be fancy SVGs or what~~

## Next level

- Mini calendars must be fully functional
- Ingest external calendars
- Text recognition for handwriting
- Turn handwriting into events
- Heavy duty responsiveness stuff
- UI accessibility, general accessibility
- Replace holidays crate with just an in-repo JSON file
- ~~Toolbar for inputs~~
- ~~What if user wants to differentiate between mouse/touch/stylus interaction?~~

## Later

- Eventually allow users to share their own templates
- Eventually allow users to create extensions/add-ons
- Notifications for events/whatever
- View format options - weekly pages side-by-side, vertical, etc.
- Be able to show/hide toolbars/menus, etc.
- Enhance TipTap UI thing

## MVP needs

- ~~One weekly right template~~
- One daily template
- One monthly template
- Offline usability
- ~~One weekly left template~~
- ~~Connect API to frontend~~
- ~~Create logic to render user templates dynamically~~

### Every WeeklyLeft template must have these divs

- month-name
- header-footer?
- wl-day-section (allow inline styling)
- day-inner-block
- day-number-circle
- day-number
- day-name
- holiday-box (optional)
- moon-phase (optional)
- textarea-container
- textarea-bg
- wl-textarea


### CSS Template requirements for template builder

- month-name
- header-footer?
- w-day-section
- w-day-inner-block
- day-number-circle
- day-number
- day-name
- holiday-box (optional)
- moon-phase (optional)
- textarea-container
- textarea-bg
- w-textarea
- d-day-section
- d-hour-section
- d-hour-inner-block
- d-hour-number



### Template editing thoughts:
- Users should be able to choose which/how many hours of the day are shown in daily views
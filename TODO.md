# To Do

## Mandatory ASAP

- Preset template options
- Blank template pages with drag and drop options
- User profiles
- Each calendar cell needs to function as a link to that day's weekly or daily page, allow for event creation, and show existing events
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
- ~~Toolbar for inputs~~
- Heavy duty responsiveness stuff
- ~~What if user wants to differentiate between mouse/touch/stylus interaction?~~
- UI accessibility, general accessibility

## Later

- Eventually allow users to share their own templates
- Eventually allow users to create extensions/add-ons
- Notifications for events/whatever
- View format options - weekly pages side-by-side, vertical, etc.
- Be able to show/hide toolbars/menus, etc.
- Enhance TipTap UI thing

## MVP needs

- ~~One weekly left template~~
- One weekly right template
- One daily template
- One monthly template
- ~~Connect API to frontend~~
- ~~Create logic to render user templates dynamically~~
- Offline usability

### Every WeeklyLeft template must have these divs

- month-name
- header-footer?
- w-l-day-section (allow inline styling)
- day-inner-block
- day-number-circle
- day-number
- day-name
- holiday-box (optional)
- moon-phase (optional)
- textarea-container
- textarea-bg
- wl-textarea

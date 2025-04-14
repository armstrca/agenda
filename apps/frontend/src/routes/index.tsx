import { createFileRoute } from '@tanstack/react-router'
import '../styles/styles.css'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  return (
    <div className="planner-container">
      <div className="month-name"></div>
      <div className="header-footer">
        <div className="overlap">
          <div className="overlap-group">
            <div className="wr-dividers">
            </div>
            <div className="wr-text-boxes">
              <div className="overlap-2">
                <textarea className="wr-right-textbox" />
                <div className="overlap-group-wrapper">
                  <div className="overlap-group-3">
                    <textarea className="textarea" />
                  </div>
                </div>
              </div>
              <textarea className="wr-left-textbox" />
              <textarea className="wr-left-textbox-2" />
              <textarea className="wr-left-textbox-top" />
            </div>
            <div className="weekly-right">
              <div className="wr-cal-container">
                <div className="wr-cal-right">
                  <div className="week-one">
                    <div className="calendar-day" style={{ left: 0 }}>
                      <button className="wr-calendar-button" id="1"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 25.40 }}>
                      <button className="wr-calendar-button" id="2"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 50.81 }}>
                      <button className="wr-calendar-button" id="3"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 76.21 }}>
                      <button className="wr-calendar-button" id="4"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 101.62 }}>
                      <button className="wr-calendar-button" id="5"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 127.02 }}>
                      <button className="wr-calendar-button" id="6"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 152.43 }}>
                      <button className="wr-calendar-button" id="7"></button>
                    </div>
                  </div>
                  <div className="week-two">
                    <div className="calendar-day" style={{ left: 0 }}>
                      <button className="wr-calendar-button" id="8"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 25.40 }}>
                      <button className="wr-calendar-button" id="9"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 50.81 }}>
                      <button className="wr-calendar-button" id="10"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 76.21 }}>
                      <button className="wr-calendar-button" id="11"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 101.62 }}>
                      <button className="wr-calendar-button" id="12"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 127.02 }}>
                      <button className="wr-calendar-button" id="13"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 152.43 }}>
                      <button className="wr-calendar-button" id="14"></button>
                    </div>
                  </div>
                  <div className="week-three">
                    <div className="calendar-day" style={{ left: 0 }}>
                      <button className="wr-calendar-button" id="15"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 25.40 }}>
                      <button className="wr-calendar-button" id="16"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 50.81 }}>
                      <button className="wr-calendar-button" id="17"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 76.21 }}>
                      <button className="wr-calendar-button" id="18"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 101.62 }}>
                      <button className="wr-calendar-button" id="19"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 127.02 }}>
                      <button className="wr-calendar-button" id="20"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 152.43 }}>
                      <button className="wr-calendar-button" id="21"></button>
                    </div>
                  </div>
                  <div className="week-four">
                    <div className="calendar-day" style={{ left: 0 }}>
                      <button className="wr-calendar-button" id="22"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 25.40 }}>
                      <button className="wr-calendar-button" id="23"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 50.81 }}>
                      <button className="wr-calendar-button" id="24"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 76.21 }}>
                      <button className="wr-calendar-button" id="25"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 101.62 }}>
                      <button className="wr-calendar-button" id="26"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 127.02 }}>
                      <button className="wr-calendar-button" id="27"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 152.43 }}>
                      <button className="wr-calendar-button" id="28"></button>
                    </div>
                  </div>
                  <div className="week-five">
                    <div className="calendar-day" style={{ left: 0 }}>
                      <button className="wr-calendar-button" id="29"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 25.40 }}>
                      <button className="wr-calendar-button" id="30"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 50.81 }}>
                      <button className="wr-calendar-button" id="31"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 76.21 }}>
                      <button className="wr-calendar-button" id="32"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 101.62 }}>
                      <button className="wr-calendar-button" id="33"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 127.02 }}>
                      <button className="wr-calendar-button" id="34"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 152.43 }}>
                      <button className="wr-calendar-button" id="35"></button>
                    </div>
                  </div>
                  <div className="week-header">
                    <div className="week-days" style={{ left: 0 }}>M
                    </div>
                    <div className="week-days" style={{ left: 25.40 }}>T
                    </div>
                    <div className="week-days" style={{ left: 50.81 }}>W
                    </div>
                    <div className="week-days" style={{ left: 76.21 }}>T
                    </div>
                    <div className="week-days" style={{ left: 101.62 }}>F
                    </div>
                    <div className="week-days" style={{ left: 127.02 }}>S
                    </div>
                    <div className="week-days" style={{ left: 152.43 }}>S
                    </div>
                  </div>
                  <div className="month-year"></div>
                </div>
                <div className="wr-cal-left">
                  <div className="week-one">
                    <div className="calendar-day" style={{ left: 0 }}>
                      <button className="wr-calendar-button" id="1"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 25.40 }}>
                      <button className="wr-calendar-button" id="2"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 50.81 }}>
                      <button className="wr-calendar-button" id="3"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 76.21 }}>
                      <button className="wr-calendar-button" id="4"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 101.62 }}>
                      <button className="wr-calendar-button" id="5"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 127.02 }}>
                      <button className="wr-calendar-button" id="6"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 152.43 }}>
                      <button className="wr-calendar-button" id="7"></button>
                    </div>
                  </div>
                  <div className="week-two">
                    <div className="calendar-day" style={{ left: 0 }}>
                      <button className="wr-calendar-button" id="8"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 25.40 }}>
                      <button className="wr-calendar-button" id="9"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 50.81 }}>
                      <button className="wr-calendar-button" id="10"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 76.21 }}>
                      <button className="wr-calendar-button" id="11"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 101.62 }}>
                      <button className="wr-calendar-button" id="12"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 127.02 }}>
                      <button className="wr-calendar-button" id="13"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 152.43 }}>
                      <button className="wr-calendar-button" id="14"></button>
                    </div>
                  </div>
                  <div className="week-three">
                    <div className="calendar-day" style={{ left: 0 }}>
                      <button className="wr-calendar-button" id="15"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 25.40 }}>
                      <button className="wr-calendar-button" id="16"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 50.81 }}>
                      <button className="wr-calendar-button" id="17"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 76.21 }}>
                      <button className="wr-calendar-button" id="18"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 101.62 }}>
                      <button className="wr-calendar-button" id="19"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 127.02 }}>
                      <button className="wr-calendar-button" id="20"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 152.43 }}>
                      <button className="wr-calendar-button" id="21"></button>
                    </div>
                  </div>
                  <div className="week-four">
                    <div className="calendar-day" style={{ left: 0 }}>
                      <button className="wr-calendar-button" id="22"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 25.40 }}>
                      <button className="wr-calendar-button" id="23"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 50.81 }}>
                      <button className="wr-calendar-button" id="24"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 76.21 }}>
                      <button className="wr-calendar-button" id="25"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 101.62 }}>
                      <button className="wr-calendar-button" id="26"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 127.02 }}>
                      <button className="wr-calendar-button" id="27"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 152.43 }}>
                      <button className="wr-calendar-button" id="28"></button>
                    </div>
                  </div>
                  <div className="week-five">
                    <div className="calendar-day" style={{ left: 0 }}>
                      <button className="wr-calendar-button" id="29"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 25.40 }}>
                      <button className="wr-calendar-button" id="30"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 50.81 }}>
                      <button className="wr-calendar-button" id="31"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 76.21 }}>
                      <button className="wr-calendar-button" id="32"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 101.62 }}>
                      <button className="wr-calendar-button" id="33"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 127.02 }}>
                      <button className="wr-calendar-button" id="34"></button>
                    </div>
                    <div className="calendar-day" style={{ left: 152.43 }}>
                      <button className="wr-calendar-button" id="35"></button>
                    </div>
                  </div>
                  <div className="week-header">
                    <div className="week-days" style={{ left: 0 }}>M
                    </div>
                    <div className="week-days" style={{ left: 25.40 }}>T
                    </div>
                    <div className="week-days" style={{ left: 50.81 }}>W
                    </div>
                    <div className="week-days" style={{ left: 76.21 }}>T
                    </div>
                    <div className="week-days" style={{ left: 101.62 }}>F
                    </div>
                    <div className="week-days" style={{ left: 127.02 }}>S
                    </div>
                    <div className="week-days" style={{ left: 152.43 }}>S
                    </div>
                  </div>
                  <div className="month-year"></div>
                </div>
              </div>
            </div>
          </div>
          <div className="wr-day-section">
            <div className="day-inner-block">
              <div className="day-number">14</div>
              <div className="day-name">Sunday</div>
              <div className="holiday-box"></div>
              <div className="moon-phase"></div>
            </div>
            <div className="w-day-lines">
              <div className="overlap-5">
                <div className="wr-textarea" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
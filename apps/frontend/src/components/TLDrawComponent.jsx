import React, { useState, useEffect, useRef } from 'react';
import { Tldraw } from 'tldraw';
import {
  DEFAULT_CAMERA_OPTIONS,
  DefaultQuickActions,
  DefaultQuickActionsContent,
  TldrawUiMenuItem,
} from 'tldraw';
import EyeSlashIcon from './EyeSlashIcon';
import PowerOffIcon from './PowerOffIcon';
import 'tldraw/tldraw.css';

function CustomQuickActions({ onToggleTldraw }) {
  return (
    <DefaultQuickActions>
      <TldrawUiMenuItem
        id='toggle-tldraw'
        label='Disable TLDraw'
        icon='toggle-on'
        onSelect={onToggleTldraw}
      />
      <DefaultQuickActionsContent />
    </DefaultQuickActions>
  );
}

export default function TlDrawComponent() {
  const [showTldraw, setShowTldraw] = useState(true);

  const toggleTldrawVisibility = () => {
    setShowTldraw((prev) => !prev);
    const appDiv = document.getElementById('app');
    if (appDiv) {
      appDiv.style.zIndex = showTldraw ? '0' : '2';
    }
  };

  const components = {
    QuickActions: () => (
      <CustomQuickActions onToggleTldraw={toggleTldrawVisibility} />
    ),
  };

  return (
    <div className='tl-toggle' style={{ zIndex: showTldraw ? 2 : 0 }}>
      {showTldraw && (
        <Tldraw
          autoFocus={false}
          persistenceKey='monthly'
          components={components}
        />
      )}
      {!showTldraw && (
        <div style={{ position: 'absolute', top: '5px', left: '5px' }}>
          <div className='tlui-buttons__horizontal'>
            <button
              id='power-off-icon'
              title='Enable TLDraw'
              onClick={toggleTldrawVisibility}
              className='tlui-icon tlui-icon__small tlui-button__icon'
              style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                zIndex: 20, // Ensure the button is always clickable
                backgroundColor: 'hsl(204, 16%, 94%)',
                color: 'black',
                borderRadius: '6px', // Adjust border-radius as needed
                border: 'none',
                height: '25px',
                width: '25px',
              }}
            >
              <PowerOffIcon
                style={{ height: '20px', width: '20px', paddingLeft: '5px' }}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Tldraw, createTLStore, getSnapshot } from 'tldraw';
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

export default function TlDrawComponent({ persistenceKey, plannerId }) {
  const [showTldraw, setShowTldraw] = useState(true);
  const [store] = useState(() => {
    const store = createTLStore();
    // Add custom migrations if needed
    return store;
  });

  const toggleTldrawVisibility = () => {
    setShowTldraw((prev) => !prev);
    const appDiv = document.getElementById('app');
    if (appDiv) {
      appDiv.style.zIndex = showTldraw ? '0' : '2';
    }
  };

  const handleMount = useCallback((editor) => {
    // Listen for document changes
    const cleanup = editor.store.listen(
      (update) => {
        if (update.source === 'user') {
          const snapshot = getSnapshot(editor.store);
          saveToBackend(snapshot.document);
        }
      },
      { scope: 'document', source: 'user' }
    );

    return () => cleanup();
  }, []);
  const debounceTimer = useRef();
  const debouncedSave = (data) => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      // Actual save logic
    }, 350); // Matches Tldraw's default throttle
  };

  const saveToBackend = useCallback(async (documentData) => {
    try {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(async () => {
        const response = await fetch(
          `http://localhost:3001/api/planners/38e012ec-0ab2-4fbe-8e68-8a75e4716a35/pages/${persistenceKey}/tldraw_snapshots`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tldraw_snapshot: {
                document_data: documentData,
                // schema: store.schema.serialize()
              }
            }),
          }
        );
        if (!response.ok) throw new Error('Save failed');
      }, 350);
    } catch (error) {
      console.error('Backend save error:', error);
    }
  }, [persistenceKey, plannerId]);
  // store.schema

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
          persistenceKey={persistenceKey}
          components={components}
          store={store}
          onMount={handleMount}
          migrations={[/* Add custom migrations if needed */]}
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
                zIndex: 20,
                backgroundColor: 'hsl(204, 16%, 94%)',
                color: 'black',
                borderRadius: '6px',
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
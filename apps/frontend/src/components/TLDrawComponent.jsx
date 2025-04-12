import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Tldraw, createTLStore, getSnapshot, loadSnapshot } from 'tldraw';
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

export default function TlDrawComponent({ persistenceKey, plannerId, tldraw_snapshots }) {
  const [storeWithStatus, setStoreWithStatus] = useState({ status: 'loading' });
  const debounceTimer = useRef();
  const [showTldraw, setShowTldraw] = useState(true);

  useEffect(() => {
    const initializeStore = async () => {
      const store = createTLStore();

      if (tldraw_snapshots?.length > 0) {
        try {
          const latestSnapshot = tldraw_snapshots[0];
          const documentData = latestSnapshot.document_data || {};
          const schema = latestSnapshot.schema || { schemaVersion: 1 };
          loadSnapshot(store, {
            document: documentData,
            schema
          });
        } catch (error) {
          console.error('Error loading tldraw_snapshot:', error);
        }
      }

      setStoreWithStatus({ store, status: 'ready' });
    };

    initializeStore();
  }, [tldraw_snapshots]);

  const toggleTldrawVisibility = () => {
    setShowTldraw((prev) => !prev);
    const appDiv = document.getElementById('app');
    if (appDiv) {
      appDiv.style.zIndex = showTldraw ? '0' : '2';
    }
  };

  const handleMount = useCallback((editor) => {
    const cleanup = editor.store.listen(
      (update) => {
        if (update.source === 'user') {
          const tldraw_snapshot = getSnapshot(editor.store);
          debouncedSave(tldraw_snapshot.document);
        }
      },
      { scope: 'document', source: 'user' }
    );

    return () => cleanup();
  }, []);

  const debouncedSave = useCallback((documentData) => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        await fetch(
          `http://localhost:3001/api/planners/38e012ec-0ab2-4fbe-8e68-8a75e4716a35/pages/${persistenceKey}/tldraw_snapshots`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tldraw_snapshot: {
                document_data: documentData,
                schema: storeWithStatus.store?.schema.serialize() // Add schema here
              }
            }),
          }
        );
      } catch (error) {
        console.error('Save error:', error);
      }
    }, 350);
  }, [plannerId, persistenceKey, storeWithStatus.store]); // Add store to dependencies


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
          store={storeWithStatus.store}
          onMount={handleMount}
          // migrations={[/* Add custom migrations if needed */]}
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
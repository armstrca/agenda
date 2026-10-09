import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tldraw,
  createTLStore,
  getSnapshot,
  loadSnapshot,
  DefaultQuickActions,
  DefaultQuickActionsContent,
  TldrawUiMenuItem,
  STROKE_SIZES,
  type Editor,
  type TLComponents,
  type TLEditorSnapshot,
  type TLStore,
  type TLStoreSnapshot,
} from 'tldraw';
import PowerOffIcon from './PowerOffIcon.tsx';
import 'tldraw/tldraw.css';
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite.js';
import { getDb } from '../db/index.ts';
import { saveSnapshot } from '../domain/snapshots.ts';
import type { SnapshotRecord, TldrawDocument } from '../domain/types.ts';

// Icons, fonts and translations bundled by Vite instead of fetched from cdn.tldraw.com, so the
// drawing layer works with no network.
const assetUrls = getAssetUrlsByImport();

STROKE_SIZES.s = .5
STROKE_SIZES.m = 2.5
STROKE_SIZES.l = 4
STROKE_SIZES.xl = 8

function CustomQuickActions({ onToggleTldraw }: { onToggleTldraw: () => void }) {
  return (
    <DefaultQuickActions>
      <TldrawUiMenuItem
        id="toggle-tldraw"
        label="Disable TLDraw"
        icon="toggle-on"
        onSelect={onToggleTldraw}
      />
      <DefaultQuickActionsContent />
    </DefaultQuickActions>
  );
}

interface TlDrawComponentProps {
  pageId: string;
  tldraw_snapshots?: SnapshotRecord[];
}

type StoreState = { status: 'loading' } | { status: 'ready'; store: TLStore };

// The drawing layer of one page. One snapshot row per page; what is persisted is the "document"
// half of tldraw's getSnapshot() (shapes and schema), never the session (camera, selection).
export default function TlDrawComponent({ pageId, tldraw_snapshots }: TlDrawComponentProps) {
  const [storeWithStatus, setStoreWithStatus] = useState<StoreState>({ status: 'loading' });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<TLEditorSnapshot | null>(null);
  const pageIdRef = useRef(pageId);
  pageIdRef.current = pageId;
  const [showTldraw, setShowTldraw] = useState(true);

  useEffect(() => {
    const store = createTLStore();
    const latestSnapshot = tldraw_snapshots?.[0];

    if (latestSnapshot) {
      let documentData: unknown = latestSnapshot.document_data || {};
      try {
        // Parse if it's a string (rows written by the old backend)
        if (typeof documentData === 'string') {
          try {
            documentData = JSON.parse(documentData);
          } catch (e) {
            console.error('[TLDrawComponent] Failed to parse document_data:', documentData, e);
            documentData = {};
          }
        }

        // The stored document is tldraw's { store, schema } store snapshot.
        loadSnapshot(store, documentData as TLStoreSnapshot);
      } catch (error) {
        console.error(
          '[TLDrawComponent] Failed to load snapshot:',
          error,
          '\nSnapshots:', tldraw_snapshots,
          '\nLatest Snapshot:', latestSnapshot,
          '\nDocument Data:', documentData,
        );
      }
    }

    setStoreWithStatus({ store, status: 'ready' });
  }, [tldraw_snapshots]);

  const toggleTldrawVisibility = () => {
    setShowTldraw(prev => !prev);
  };

  const persist = useCallback(async (snapshot: TLEditorSnapshot) => {
    const page_id = pageIdRef.current;
    if (!page_id) return;
    try {
      const db = await getDb();
      await saveSnapshot(db, { page_id, document: snapshot.document as unknown as TldrawDocument });
    } catch (error) {
      console.error('[TLDrawComponent] Failed to save snapshot:', error, '\nPage ID:', page_id);
    }
  }, []);

  const debouncedSave = useCallback((snapshot: TLEditorSnapshot) => {
    pending.current = snapshot;
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      pending.current = null;
      void persist(snapshot);
    }, 350);
  }, [persist]);

  // Flush a pending save when the page unmounts (navigation) so a stroke drawn just before leaving is kept.
  useEffect(() => () => {
    clearTimeout(debounceTimer.current);
    if (pending.current !== null) {
      const snapshot = pending.current;
      pending.current = null;
      void persist(snapshot);
    }
  }, [persist]);

  const handleMount = useCallback((editor: Editor) => {
    const cleanup = editor.store.listen(
      (update) => {
        if (update.source === 'user') {
          debouncedSave(getSnapshot(editor.store));
        }
      },
      { scope: 'document', source: 'user' }
    );
    return () => cleanup();
  }, [debouncedSave]);

  const components: TLComponents = {
    QuickActions: () => (
      <CustomQuickActions onToggleTldraw={toggleTldrawVisibility} />
    ),
  };

  return (
    <>
      {/* TLDraw Container: toggles size and stacking */}
      <div
        id="tl-toggle-container"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: showTldraw ? 1 : 0,
          width: showTldraw ? '100%' : '0px',
          height: showTldraw ? '100%' : '0px',
          overflow: 'hidden',
        }}
      >
        {showTldraw && storeWithStatus.status === 'ready' && (
          <Tldraw
            autoFocus={false}
            assetUrls={assetUrls}
            components={components}
            store={storeWithStatus.store}
            onMount={handleMount}
          />
        )}
      </div>

      {/* PowerOff Icon: always accessible with high z-index */}
      {!showTldraw && (
        <div
          className="tlui-buttons__horizontal"
          style={{ position: 'absolute', top: '5px', left: '5px', zIndex: 3 }}
        >
          <button
            id="power-off-icon"
            title="Enable TLDraw"
            onClick={toggleTldrawVisibility}
            className="tlui-icon tlui-icon__small tlui-button__icon"
            style={{
              position: 'relative',
              backgroundColor: 'transparent',
              color: 'black',
              borderRadius: '6px',
              border: 'none',
              height: '25px',
              width: '25px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 3,
            }}
          >
            <PowerOffIcon />
          </button>
        </div>
      )}
    </>
  );
}

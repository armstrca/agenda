import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tldraw,
  createTLStore,
  getSnapshot,
  loadSnapshot,
  CenteredTopPanelContainer,
  DefaultActionsMenu,
  DefaultMainMenu,
  DefaultQuickActions,
  DefaultQuickActionsContent,
  TldrawUiMenuItem,
  TldrawUiRow,
  TldrawUiToolbar,
  ArrowShapeUtil,
  DrawShapeUtil,
  GeoShapeUtil,
  LineShapeUtil,
  TLUiComponents,
  type Editor,
  type TLComponents,
  type TLDefaultSizeStyle,
  type TLEditorSnapshot,
  type TLStore,
  type TLStoreSnapshot,
} from 'tldraw';
import PowerOffIcon from './PowerOffIcon.tsx';
import { PopoverOnlyStylePanel, ToolbarWithStyleButton } from './ToolbarWithStyleButton.tsx';
import 'tldraw/tldraw.css';
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite.js';
import { getDb } from '../db/index.ts';
import { saveSnapshot } from '../domain/snapshots.ts';
import type { SnapshotRecord, TldrawDocument } from '../domain/types.ts';

// Icons, fonts and translations bundled by Vite instead of fetched from cdn.tldraw.com, so the
// drawing layer works with no network.
const assetUrls = getAssetUrlsByImport();

// Thinner pens than tldraw's defaults (2 / 3.5 / 5 / 10 px), suited to writing on a paper page.
// tldraw 5 removed the global STROKE_SIZES table; stroke widths are now per shape util, so the
// four utils that used that table are configured with the same widths.
const STROKE_WIDTHS: Record<TLDefaultSizeStyle, number> = { s: 0.5, m: 2.5, l: 4, xl: 8 };
const strokeWidthFor = (_editor: unknown, shape: { props: { size: TLDefaultSizeStyle } }) => ({
  strokeWidth: STROKE_WIDTHS[shape.props.size],
});
const shapeUtils = [
  DrawShapeUtil.configure({ getCustomDisplayValues: strokeWidthFor }),
  LineShapeUtil.configure({ getCustomDisplayValues: strokeWidthFor }),
  GeoShapeUtil.configure({ getCustomDisplayValues: strokeWidthFor }),
  ArrowShapeUtil.configure({ getCustomDisplayValues: strokeWidthFor }),
];

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

// The main menu, the quick actions (with the drawing on/off toggle) and the actions menu, centred
// at the top of the page instead of in the top-left panel. Laid out like tldraw's DefaultMenuPanel
// (menu, then the actions toolbar, in one row). CenteredTopPanelContainer is tldraw's own centring
// for the top-center zone; it slides right rather than overlap the left panel.
function CenteredQuickActions({ onToggleTldraw }: { onToggleTldraw: () => void }) {
  return (
    <CenteredTopPanelContainer>
      <nav className="tlui-menu-zone quick-actions-zone">
        <TldrawUiRow>
          <DefaultMainMenu />
          <TldrawUiToolbar orientation="horizontal" label="Actions">
            <CustomQuickActions onToggleTldraw={onToggleTldraw} />
            <DefaultActionsMenu />
          </TldrawUiToolbar>
        </TldrawUiRow>
      </nav>
    </CenteredTopPanelContainer>
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
  const [showTldraw, setShowTldraw] = useState(false);

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

  // MainMenu, QuickActions and ActionsMenu are null so neither the top-left menu panel nor (on
  // narrow screens) the bottom toolbar shows them a second time; TopPanel renders them instead.
  // With those moved and the page menu hidden by maxPages: 1, the top-left panel would be an empty
  // box, so it is turned off too.
  const components: TLComponents = {
    MenuPanel: null,
    MainMenu: null,
    QuickActions: null,
    ActionsMenu: null,
    TopPanel: () => (
      <CenteredQuickActions onToggleTldraw={toggleTldrawVisibility} />
    ),
    ZoomMenu: null,
    Minimap: null,
    // The style panel opens from a colour button in the bottom toolbar, as on phones.
    StylePanel: PopoverOnlyStylePanel,
    Toolbar: ToolbarWithStyleButton,
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
            shapeUtils={shapeUtils}
            store={storeWithStatus.store}
            onMount={handleMount}
            options={{ maxPages: 1 }}
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

import { useRef } from 'react';
import {
  DefaultStylePanel,
  DefaultToolbarContent,
  MobileStylePanel,
  OverflowingToolbar,
  TldrawUiOrientationProvider,
  ToggleToolLockedButton,
  useEditor,
  usePassThroughWheelEvents,
  useReadonly,
  useValue,
  type TLUiStylePanelProps,
} from 'tldraw';

// The style panel as tldraw shows it on phones (`forceMobile`), but on every screen size and with
// the rest of the UI left alone: a colour button at the end of the bottom toolbar that opens the
// panel in a popover. tldraw has no per-component forceMobile (its breakpoint provider is not
// exported), so the two pieces below do it with exported parts:
//   - ToolbarWithStyleButton is tldraw's DefaultToolbar (tldraw 5.5) with the mobile style button
//     always present instead of only below the TABLET_SM breakpoint. Its quick-actions block is
//     left out because quick actions live in the centred top panel (see TLDrawComponent).
//   - PopoverOnlyStylePanel renders only inside that popover (`isMobile`), so the desktop copy
//     in the top-right corner disappears. MobileStylePanel needs a StylePanel component to exist,
//     so it cannot simply be set to null.

const ORIENTATION = 'horizontal';

export function PopoverOnlyStylePanel(props: TLUiStylePanelProps) {
  return props.isMobile ? <DefaultStylePanel {...props} /> : null;
}

export function ToolbarWithStyleButton() {
  const editor = useEditor();
  const isReadonlyMode = useReadonly();
  const activeToolId = useValue('current tool id', () => editor.getCurrentToolId(), [editor]);

  const ref = useRef<HTMLDivElement>(null);
  usePassThroughWheelEvents(ref);

  return (
    <TldrawUiOrientationProvider orientation={ORIENTATION} tooltipSide="top">
      <div ref={ref} className={`tlui-main-toolbar tlui-main-toolbar--${ORIENTATION}`}>
        <div className="tlui-main-toolbar__inner">
          <div className="tlui-main-toolbar__left">
            {!isReadonlyMode && (
              <div className="tlui-main-toolbar__extras">
                <ToggleToolLockedButton activeToolId={activeToolId} />
              </div>
            )}
            <OverflowingToolbar
              orientation={ORIENTATION}
              sizingParentClassName="tlui-main-toolbar"
              minItems={4}
              maxItems={8}
              minSizePx={310}
              maxSizePx={470}
            >
              <DefaultToolbarContent />
            </OverflowingToolbar>
          </div>
          {!isReadonlyMode && (
            <div className="tlui-main-toolbar__tools tlui-main-toolbar__mobile-style-panel">
              <MobileStylePanel />
            </div>
          )}
        </div>
      </div>
    </TldrawUiOrientationProvider>
  );
}

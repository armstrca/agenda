import React, { useMemo, useRef, useState, useEffect, Dispatch, SetStateAction } from 'react'
// import TemplateRenderer from '../weekly/TemplateRenderer.jsx'
import { savePageTemplate } from '../../services/api.ts'

type TemplateType = 'daily' | 'weekly_left' | 'weekly_right' | 'monthly' | 'extra'

// Add interactive edit overlay for eb-* shapes
type TemplateContent = {
  metadata: {
    type: TemplateType,
    svgBackground?: string,
    default_styles: Record<string, any>,
    base_dimensions: { width: number; height: number }
  }
  structure: any[]
}

const makeStarter = (type: TemplateType): TemplateContent => {
  const base = {
    metadata: {
      type,
      svgBackground: type.includes('weekly')
        ? `/images/${type}/bg.svg`
        : `/images/${type}/bg.svg`,
      default_styles: {
        'week-start-day': 'Mon',
        'planner-container': {
          width: '960px',
          height: '1440px',
          'z-index': '0',
          position: 'relative',
        },
        'month-colors': {
          january: '#764978',
          february: '#9695d3',
          march: '#005baa',
          april: '#ffc0cb',
          may: '#799a05',
          june: '#00acc8',
          july: '#da3696',
          august: '#c00d0d',
          september: '#f9b000',
          october: '#ec7103',
          november: '#7d4e24',
          december: '#8aad84',
        },
      },
      base_dimensions: { width: 960, height: 1440 },
    },
    structure: [
      { class: 'planner-container', component: 'div', children: [
        { class: 'month-name', component: 'div' },
      ]},
    ],
  }
  return base
}

// ------- Drag & Drop Blocks -------
type BlockId =
  | 'header-footer-line'
  | 'full-divider'
  | 'half-divider'
  | 'vertical-divider'
  | 'dashed-line'
  | 'date-circle'
  | 'text-box'
  | 'test-block'
  | 'wl-day-section'
  | 'header-footer-group'

type StructureNode = {
  component: string
  class?: string
  component_type?: string
  children?: StructureNode[]
  attributes?: Record<string, any>
  styles?: Record<string, any>
  text?: string
}

const createNodeForBlock = (
  block: BlockId,
  x: number,
  y: number,
): StructureNode => {
  switch (block) {
    case 'wl-day-section': {
      // Model the input lines so we can add/remove them when vertically resizing
      const headerPx = 85
      const lineSpacingPx = 25
      const bottomOffsetPx = 5
      const defaultLines = 4
      const totalHeight = headerPx + defaultLines * lineSpacingPx + bottomOffsetPx
      // helper to build line elements at fixed spacing
      const buildLines = (lines: number, totalH: number) => {
        const arr: any[] = []
        // bottom bold divider
        arr.push({ component: 'line', attributes: { x1: 30, y1: totalH - bottomOffsetPx, x2: 900, y2: totalH - bottomOffsetPx, stroke: 'black', strokeWidth: 2 } })
        for (let i = 0; i < lines; i++) {
          const y = headerPx + i * lineSpacingPx
          arr.push({ component: 'line', attributes: { x1: 45, y1: y, x2: 885, y2: y, stroke: 'black', strokeOpacity: 0.54 } })
        }
        return arr
      }
      return {
        component: 'div',
        class: 'wl-day-section',
        attributes: {
          'data-lines': defaultLines,
          'data-line-spacing': lineSpacingPx,
          'data-header': headerPx,
          'data-bottom-offset': bottomOffsetPx,
        },
        styles: {
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          width: '900px',
          height: `${totalHeight}px`,
        },
        children: [
          {
            component: 'svg',
            attributes: { width: '100%', height: '100%', viewBox: `0 0 900 ${totalHeight}`, preserveAspectRatio: 'none' },
            styles: { position: 'absolute', inset: 0, pointerEvents: 'none' },
            children: [
              { component: 'circle', attributes: { cx: 67.5, cy: 70, r: 22.5, fill: 'currentColor', fillOpacity: 0.5 } },
              ...buildLines(defaultLines, totalHeight),
            ],
          },
          {
            component: 'div',
            class: 'day-inner-block',
            children: [
              { component: 'div', class: 'day-number', text: '29' },
              { component: 'div', class: 'day-name', text: 'Monday' },
              { component: 'div', class: 'holiday-box' },
              { component: 'div', class: 'moon-phase', text: '🌓' },
            ],
          },
          {
            component: 'div',
            class: 'textarea-container',
            children: [
              {
                component: 'div',
                class: 'textarea-bg',
                children: [
                  { component: 'div', class: 'wl-tiptap-main' },
                ],
              },
            ],
          },
        ],
      }
    }
    case 'header-footer-group': {
      const sectionHeight = 210
      const width = 900
      const height = sectionHeight * 6
      return {
        component: 'div',
        class: 'header-footer',
        styles: {
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          width: `${width}px`,
          height: `${height}px`,
        },
        children: [
          createNodeForBlock('wl-day-section', 0, 0),
          createNodeForBlock('wl-day-section', 0, sectionHeight * 1),
          createNodeForBlock('wl-day-section', 0, sectionHeight * 2),
          createNodeForBlock('wl-day-section', 0, sectionHeight * 3),
          createNodeForBlock('wl-day-section', 0, sectionHeight * 4),
          createNodeForBlock('wl-day-section', 0, sectionHeight * 5),
        ],
      }
    }
    case 'header-footer-line':
      return {
        component: 'div',
        class: 'eb-header-footer-line',
        styles: {
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          width: '900px',
          height: '4px',
          backgroundColor: 'var(--eb-primary, #ff0000)',
        },
      }
    case 'full-divider':
      return {
        component: 'div',
        class: 'eb-full-divider',
        styles: {
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          width: '900px',
          height: '2px',
          backgroundColor: '#000',
        },
      }
    case 'half-divider':
      return {
        component: 'div',
        class: 'eb-half-divider',
        styles: {
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          width: '435px',
          height: '1px',
          backgroundColor: '#ff7070',
        },
      }
    case 'vertical-divider':
      return {
        component: 'div',
        class: 'eb-vertical-divider',
        styles: {
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          width: '2px',
          height: '850px',
          backgroundColor: '#000',
        },
      }
    case 'dashed-line':
      return {
        component: 'div',
        class: 'input-line',
        styles: {
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          width: '420px',
          height: '1px',
          borderTop: '1px dashed rgba(0,0,0,0.54)',
        },
      }
    case 'date-circle':
      return {
        component: 'div',
        class: 'eb-date-circle',
        styles: {
          position: 'absolute',
          left: `${x - 22.5}px`,
          top: `${y - 22.5}px`,
          width: '45px',
          height: '45px',
          borderRadius: '50%',
          backgroundColor: 'rgba(252,182,182,0.5)',
        },
      }
    case 'text-box':
      return {
        component: 'div',
        class: 'textarea-style',
        styles: {
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          width: '200px',
          minHeight: '40px',
          border: '1px dashed #aaa',
          padding: '8px',
          color: '#333',
          background: 'rgba(255,255,255,0.8)'
        },
        children: [
          { component: 'span', styles: { fontSize: '12px', opacity: 0.6 }, children: [] },
        ],
      }
    case 'test-block':
      return {
        component: 'div',
        class: 'eb-test-block',
        styles: {
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          width: '220px',
          height: '80px',
          borderRadius: '10px',
          backgroundColor: '#4F46E5',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 10px rgba(0,0,0,0.15)'
        },
        children: [
          { component: 'span', styles: { fontWeight: 700 }, children: [] }
        ]
      }
  }
}

const BLOCK_PALETTE: { id: BlockId; label: string; hint?: string }[] = [
  { id: 'header-footer-line', label: 'Header/Footer Line', hint: 'Thick red bar' },
  { id: 'full-divider', label: 'Full Divider', hint: '900px solid' },
  { id: 'half-divider', label: 'Half Divider', hint: '435px accent' },
  { id: 'vertical-divider', label: 'Vertical Divider' },
  { id: 'dashed-line', label: 'Dashed Line' },
  { id: 'date-circle', label: 'Date Circle' },
  { id: 'text-box', label: 'Text Box' },
  { id: 'test-block', label: 'Test Block', hint: 'Click to place (WebView safe)' },
  { id: 'wl-day-section', label: 'Day Section (weekly_left)', hint: 'Composite group' },
  { id: 'header-footer-group', label: 'Header/Footer (6 day sections)', hint: 'Container + six WL day sections' },
]

const SidebarField: React.FC<{
  label: string
  children: React.ReactNode
}> = ({ label, children }) => (
  <label style={{ display: 'block', marginBottom: 12 }}>
    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>{label}</div>
    {children}
  </label>
)

const ScaleControls: React.FC<{
  base: { width: number; height: number }
  onScale: (scale: number) => void
}> = ({ base, onScale }) => {
  const [fit, setFit] = useState<'fit-width' | 'fit-height' | 'custom'>('fit-width')
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const recalc = () => {
      const container = document.getElementById('editor-canvas-container')
      if (!container) return
      const cw = container.clientWidth - 16
      const ch = container.clientHeight - 16
      if (fit === 'fit-width') {
        const s = cw / base.width
        setScale(s)
        onScale(s)
      } else if (fit === 'fit-height') {
        const s = ch / base.height
        setScale(s)
        onScale(s)
      }
    }
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [fit, base.width, base.height, onScale])

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <select value={fit} onChange={(e) => setFit(e.target.value as any)}>
        <option value="fit-width">Fit width</option>
        <option value="fit-height">Fit height</option>
        <option value="custom">Custom</option>
      </select>
      <input
        type="range"
        min={0.25}
        max={2}
        step={0.05}
        value={scale}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          setScale(v)
          onScale(v)
          setFit('custom')
        }}
      />
      <span style={{ width: 48, textAlign: 'right' }}>{Math.round(scale * 100)}%</span>
    </div>
  )
}

const RightSidebar: React.FC<{
  name: string
  setName: (v: string) => void
  templateType: TemplateType
  setTemplateType: (t: TemplateType) => void
  isDefault: boolean
  setIsDefault: (v: boolean) => void
  userId: string
  setUserId: (v: string) => void
  plannerId: string
  setPlannerId: (v: string) => void
  content: TemplateContent
  setContent: Dispatch<SetStateAction<TemplateContent>>
  selectedIndex: number | null
  setSelectedIndex: (idx: number | null) => void
  onSave: () => Promise<void>
  onCopy: () => void
  onDownload: () => void
}> = ({
  name,
  setName,
  templateType,
  setTemplateType,
  isDefault,
  setIsDefault,
  userId,
  setUserId,
  plannerId,
  setPlannerId,
  content,
  setContent,
  selectedIndex,
  setSelectedIndex,
  onSave,
  onCopy,
  onDownload,
}) => {
  const [monthKey, setMonthKey] = useState('january')
  const monthColors = content.metadata.default_styles['month-colors'] || {}

  const updateBaseDim = (key: 'width' | 'height', value: number) => {
    setContent({
      ...content,
      metadata: {
        ...content.metadata,
        base_dimensions: { ...content.metadata.base_dimensions, [key]: value },
        default_styles: {
          ...content.metadata.default_styles,
          'planner-container': {
            ...content.metadata.default_styles['planner-container'],
            [key === 'width' ? 'width' : 'height']: `${value}px`,
          },
        },
      },
    })
  }

  const setMonthColor = (k: string, v: string) => {
    setContent({
      ...content,
      metadata: {
        ...content.metadata,
        default_styles: {
          ...content.metadata.default_styles,
          'month-colors': { ...monthColors, [k]: v },
        },
      },
    })
  }

  const KNOWN_CLASSES = [
    'month-name',
    'planner-container',
    'monthly-layout',
    'monthly-week-header',
    'day-block',
    'input-line',
    'textarea-style',
    'header-footer',
    'wr-day-section',
    'overlap',
    // weekly_left specific classes
    'wl-day-section',
    'day-inner-block',
    'day-number',
    'day-name',
    'holiday-box',
    'moon-phase',
    'textarea-container',
    'textarea-bg',
    'wl-tiptap-main',
  ]

  const root = (content.structure || []).find((n: any) => n.class === 'planner-container')
  const children = (root?.children || []) as StructureNode[]
  const selected = selectedIndex != null ? children[selectedIndex] : null
  const selectedStyles = selected?.styles || {}

  const parsePx = (v: any, fallback = 0): number => {
    if (v == null) return fallback
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const m = v.match(/-?\d+(?:\.\d+)?/)
      return m ? parseFloat(m[0]) : fallback
    }
    return fallback
  }

  const updateSelected = (updater: (n: StructureNode) => StructureNode) => {
    if (selectedIndex == null) return
    setContent((prev) => {
      const structure = Array.isArray(prev.structure) ? [...prev.structure] : []
      const rIdx = structure.findIndex((n: any) => n.class === 'planner-container')
      if (rIdx === -1) return prev
      const root = { ...structure[rIdx] }
      const ch = Array.isArray((root as any).children) ? [ ...(root as any).children ] : []
      const cur = { ...ch[selectedIndex] }
      ch[selectedIndex] = updater(cur)
      ;(root as any).children = ch
      structure[rIdx] = root as any
      return { ...prev, structure }
    })
  }

  const rotMatch = /rotate\(([-\d.]+)deg\)/.exec(selectedStyles.transform || '')
  const rotation = rotMatch ? parseFloat(rotMatch[1]) : 0

  return (
    <div style={{ width: 320, borderLeft: '1px solid #eee', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0 }}>Template settings</h3>
      <SidebarField label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Weekly Left" />
      </SidebarField>
      <SidebarField label="Template type">
        <select value={templateType} onChange={(e) => setTemplateType(e.target.value as TemplateType)}>
          <option value="weekly_left">weekly_left</option>
          <option value="weekly_right">weekly_right</option>
          <option value="daily">daily</option>
          <option value="monthly">monthly</option>
          <option value="extra">extra</option>
        </select>
      </SidebarField>
      <SidebarField label="Default?">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
      </SidebarField>
      <SidebarField label="User ID (uuid string)">
        <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user uuid" />
      </SidebarField>
      <SidebarField label="Planner ID (uuid string)">
        <input value={plannerId} onChange={(e) => setPlannerId(e.target.value)} placeholder="planner uuid" />
      </SidebarField>
      <h4 style={{ marginBottom: 4 }}>Canvas</h4>
      <SidebarField label="Width (px)">
        <input type="number" value={content.metadata.base_dimensions.width}
               onChange={(e) => updateBaseDim('width', parseInt(e.target.value || '0', 10))} />
      </SidebarField>
      <SidebarField label="Height (px)">
        <input type="number" value={content.metadata.base_dimensions.height}
               onChange={(e) => updateBaseDim('height', parseInt(e.target.value || '0', 10))} />
      </SidebarField>
      <h4 style={{ marginBottom: 4 }}>Month colors</h4>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
          {Object.keys(monthColors).map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <input type="color" value={monthColors[monthKey]}
               onChange={(e) => setMonthColor(monthKey, e.target.value)} />
      </div>
      {selected && (
        <div style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
          <h4 style={{ marginBottom: 8 }}>Selected element</h4>
          <SidebarField label="Class name">
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={selected.class || ''}
                onChange={(e) => updateSelected((n) => ({ ...n, class: e.target.value }))}
              >
                <option value="">(none)</option>
                {KNOWN_CLASSES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                placeholder="custom class"
                value={selected.class || ''}
                onChange={(e) => updateSelected((n) => ({ ...n, class: e.target.value }))}
                style={{ flex: 1 }}
              />
            </div>
          </SidebarField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <SidebarField label="X (px)">
              <input type="number" value={parsePx(selectedStyles.left, 0)}
                     onChange={(e) => updateSelected((n) => ({
                       ...n,
                       styles: { ...(n.styles||{}), left: `${parseInt(e.target.value||'0',10)}px` }
                     }))} />
            </SidebarField>
            <SidebarField label="Y (px)">
              <input type="number" value={parsePx(selectedStyles.top, 0)}
                     onChange={(e) => updateSelected((n) => ({
                       ...n,
                       styles: { ...(n.styles||{}), top: `${parseInt(e.target.value||'0',10)}px` }
                     }))} />
            </SidebarField>
            <SidebarField label="Width (px)">
              <input type="number" value={parsePx(selectedStyles.width, 100)}
                     onChange={(e) => updateSelected((n) => ({
                       ...n,
                       styles: { ...(n.styles||{}), width: `${parseInt(e.target.value||'0',10)}px` }
                     }))} />
            </SidebarField>
            <SidebarField label="Height (px)">
              <input type="number" value={parsePx(selectedStyles.height, parsePx(selectedStyles.minHeight, 40))}
                     onChange={(e) => updateSelected((n) => ({
                       ...n,
                       styles: { ...(n.styles||{}), height: `${parseInt(e.target.value||'0',10)}px` }
                     }))} />
            </SidebarField>
            <SidebarField label="Rotate (deg)">
              <input type="number" value={rotation}
                     onChange={(e) => updateSelected((n) => ({
                       ...n,
                       styles: { ...(n.styles||{}), transform: `rotate(${parseFloat(e.target.value||'0')}deg)` }
                     }))} />
            </SidebarField>
            <SidebarField label="z-index">
              <input type="number" value={parseInt((selectedStyles['z-index'] || selectedStyles.zIndex || '0') as any)}
                     onChange={(e) => updateSelected((n) => ({
                       ...n,
                       styles: { ...(n.styles||{}), ['z-index' as any]: String(parseInt(e.target.value||'0',10)) }
                     }))} />
            </SidebarField>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => {
              // duplicate
              updateSelected((n) => n) // no-op to ensure closure
              setContent((prev) => {
                const structure = Array.isArray(prev.structure) ? [...prev.structure] : []
                const rIdx = structure.findIndex((n: any) => n.class === 'planner-container')
                if (rIdx === -1) return prev
                const root = { ...structure[rIdx] } as any
                const ch = Array.isArray(root.children) ? [...root.children] : []
                const cur = { ...ch[selectedIndex!] }
                // offset duplicate a bit
                const parse = (v: any) => (typeof v === 'string' ? parseInt(v, 10) : (v || 0))
                const left = parse(cur.styles?.left)
                const top = parse(cur.styles?.top)
                cur.styles = { ...(cur.styles || {}), left: `${left + 10}px`, top: `${top + 10}px` }
                ch.splice(selectedIndex! + 1, 0, cur)
                root.children = ch
                structure[rIdx] = root
                return { ...prev, structure }
              })
            }}>Duplicate</button>
            <button onClick={() => {
              setContent((prev) => {
                const structure = Array.isArray(prev.structure) ? [...prev.structure] : []
                const rIdx = structure.findIndex((n: any) => n.class === 'planner-container')
                if (rIdx === -1) return prev
                const root = { ...structure[rIdx] } as any
                const ch = Array.isArray(root.children) ? [...root.children] : []
                ch.splice(selectedIndex!, 1)
                root.children = ch
                structure[rIdx] = root
                return { ...prev, structure }
              })
              setSelectedIndex(null)
            }}>Delete</button>
          </div>
        </div>
      )}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={onSave}>Save to backend</button>
        <button onClick={onCopy}>Copy JSON</button>
        <button onClick={onDownload}>Download JSON</button>
      </div>
    </div>
  )
}

const Canvas: React.FC<{
  content: TemplateContent
  setContent: Dispatch<SetStateAction<TemplateContent>>
  plannerId?: string
  selectedIndex: number | null
  setSelectedIndex: (idx: number | null) => void
  registerCanvasApi?: (api: { placeAtClient: (block: BlockId, clientX: number, clientY: number) => void; getCanvasRect: () => DOMRect | null }) => void
}> = ({ content, setContent, plannerId, selectedIndex, setSelectedIndex, registerCanvasApi }) => {
  const [scale, setScale] = useState(1)
  const base = content.metadata.base_dimensions
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [showPreview, setShowPreview] = useState(true)
  const draggingRef = useRef<null | {
    type: 'move' | 'resize' | 'rotate'
    startX: number
    startY: number
    startLeft: number
    startTop: number
    startWidth: number
    startHeight: number
    startAngle?: number
    index: number
  }>(null)
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] })
  const lastPlaceRef = useRef<{ sig: string; ts: number } | null>(null)

  const ensurePlannerContainer = (structure: any[]): any => {
    let root = structure.find((n) => n.class === 'planner-container')
    if (!root) {
      root = { component: 'div', class: 'planner-container', children: [] }
      structure.push(root)
    }
    if (!root.children) root.children = []
    return root
  }

  const getPlannerRoot = (structure: any[]) => {
    return structure.find((n) => n.class === 'planner-container') as StructureNode | undefined
  }

  const parsePx = (v: any, fallback = 0): number => {
    if (v == null) return fallback
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const m = v.match(/-?\d+(?:\.\d+)?/)
      return m ? parseFloat(m[0]) : fallback
    }
    return fallback
  }

  const updateChildStyles = (index: number, updater: (styles: Record<string, any>) => Record<string, any>) => {
    setContent((prev) => {
      const structure = Array.isArray(prev.structure) ? [...prev.structure] : []
      let rootIndex = structure.findIndex((n: any) => n.class === 'planner-container')
      if (rootIndex === -1) {
        const root: any = { component: 'div', class: 'planner-container', children: [] }
        structure.push(root)
        rootIndex = structure.length - 1
      }
      const root: any = { ...structure[rootIndex] }
      const children: any[] = Array.isArray(root.children) ? [...root.children] : []
      const child = { ...(children[index] || {}) }
      child.styles = updater({ ...(child.styles || {}) })
      children[index] = child
      root.children = children
      structure[rootIndex] = root
      return { ...prev, structure }
    })
  }

  // Update the entire child node (not just styles)
  const updateChildNode = (index: number, updater: (node: any) => any) => {
    setContent((prev) => {
      const structure = Array.isArray(prev.structure) ? [...prev.structure] : []
      let rootIndex = structure.findIndex((n: any) => n.class === 'planner-container')
      if (rootIndex === -1) return prev
      const root: any = { ...structure[rootIndex] }
      const children: any[] = Array.isArray(root.children) ? [...root.children] : []
      const child = { ...(children[index] || {}) }
      const nextChild = updater(child)
      children[index] = nextChild
      root.children = children
      structure[rootIndex] = root
      return { ...prev, structure }
    })
  }

  const deleteChild = (index: number) => {
    setContent((prev) => {
      const structure = Array.isArray(prev.structure) ? [...prev.structure] : []
      const rIdx = structure.findIndex((n: any) => n.class === 'planner-container')
      if (rIdx === -1) return prev
      const root = { ...structure[rIdx] } as any
      const ch = Array.isArray(root.children) ? [...root.children] : []
      ch.splice(index, 1)
      root.children = ch
      structure[rIdx] = root
      return { ...prev, structure }
    })
  }

  // Keyboard delete/backspace for selected element
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedIndex == null) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteChild(selectedIndex)
        setSelectedIndex(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIndex])

  const placeAt = (block: BlockId, clientX: number, clientY: number) => {
    const containerEl = canvasRef.current
    if (!containerEl) return
    const rect = containerEl.getBoundingClientRect()
    const x = (clientX - rect.left) / scale
    const y = (clientY - rect.top) / scale
    const rx = Math.round(x)
    const ry = Math.round(y)
    const sig = `${block}:${rx}:${ry}`
    const now = Date.now()
    if (lastPlaceRef.current && lastPlaceRef.current.sig === sig && now - lastPlaceRef.current.ts < 350) {
      // guard against duplicate placements within a short interval at the same spot
      return
    }
    lastPlaceRef.current = { sig, ts: now }
    const node = createNodeForBlock(block, rx, ry)
    setContent((prev) => ({
      ...prev,
      structure: (() => {
        const s = Array.isArray(prev.structure) ? [...prev.structure] : []
        const root = ensurePlannerContainer(s)
        const ch = Array.isArray((root as any).children) ? [ ...(root as any).children ] : []
        const last = ch[ch.length - 1]
        const num = (v: any) => (typeof v === 'string' ? parseInt(v, 10) : (typeof v === 'number' ? v : 0))
        if (last && last.class === node.class) {
          const lx = num(last.styles?.left)
          const ly = num(last.styles?.top)
          const nx = num(node.styles?.left)
          const ny = num(node.styles?.top)
          if (lx === nx && ly === ny) {
            // identical last child already exists — treat as duplicate and ignore
            return s
          }
        }
        ch.push(node)
        ;(root as any).children = ch
        return s
      })(),
    }))
  }

  // Native HTML5 DnD is disabled to avoid duplicate placements with the custom ghost drag.

  useEffect(() => {
    if (!registerCanvasApi) return
    registerCanvasApi({
      placeAtClient: (block, x, y) => placeAt(block, x, y),
      getCanvasRect: () => canvasRef.current?.getBoundingClientRect() || null,
    })
  }, [registerCanvasApi])

  // Simple renderer for structure nodes (no TemplateRenderer, no TLDraw)
  const camelize = (k: string) => k.replace(/-([a-z])/g, (_m, c) => c.toUpperCase())
  const normalizeStyles = (styles?: Record<string, any>) => {
    if (!styles) return undefined
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(styles)) {
      const key = k === 'z-index' ? 'zIndex' : camelize(k)
      out[key] = v
    }
    return out
  }
  const renderNode = (node: any, idx: number): React.ReactNode => {
    if (!node) return null
    const tag = (node.component || 'div') as any
    const attrs = node.attributes || {}
    const styles = normalizeStyles(node.styles)
    const childNodes: any[] | undefined = Array.isArray(node.children)
      ? node.children.map((c: any, i: number) => renderNode(c, i))
      : undefined
    if (node.text != null) {
      if (Array.isArray(childNodes)) childNodes.push(node.text)
    }
    const props: any = { key: idx, className: node.class, style: styles, ...attrs }
    return React.createElement(tag as any, props, childNodes)
  }

  return (
  <div id="editor-canvas-container" style={{ flex: 1, overflowX: 'hidden', overflowY: 'scroll', background: '#fafafa', display: 'flex', flexDirection: 'column' }}
         onDragOver={(e) => e.preventDefault()}>
      <div style={{ padding: 12, borderBottom: '1px solid #eee', background: '#fff', display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
        <ScaleControls base={base} onScale={setScale} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showPreview} onChange={(e) => setShowPreview(e.target.checked)} />
          <span>Show preview</span>
        </label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
        <div
          style={{
            width: base.width,
            height: base.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: '1px solid #ddd',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            background: '#fff',
            position: 'relative',
            userSelect: draggingRef.current ? 'none' as const : 'auto',
          }}
          ref={canvasRef}
        >
          {/* Base overlay to clear selection when clicking empty space */}
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'transparent' }}
            onMouseDown={(e) => {
              // Clicking empty space clears selection
              setSelectedIndex(null)
            }}
          />

          {/* Preview layer (internal renderer) */}
          {showPreview && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {Array.isArray(content.structure) && content.structure.map((n, i) => renderNode(n, i))}
            </div>
          )}

          {/* Guides */}
          {guides.v.map((x, i) => (
            <div key={`vg-${i}`} style={{ position: 'absolute', left: x, top: 0, bottom: 0, width: 1, background: '#60a5fa', zIndex: 2, pointerEvents: 'none' }} />
          ))}
          {guides.h.map((y, i) => (
            <div key={`hg-${i}`} style={{ position: 'absolute', top: y, left: 0, right: 0, height: 1, background: '#60a5fa', zIndex: 2, pointerEvents: 'none' }} />
          ))}

          {/* Editing overlay hitboxes for each child under planner-container */}
          {(() => {
            const root = getPlannerRoot(content.structure)
            const children = (root?.children || []) as StructureNode[]
            return children.map((child, idx) => {
              const styles = child.styles || {}
              const left = parsePx(styles.left, 0)
              const top = parsePx(styles.top, 0)
              const width = parsePx(styles.width, 100)
              const height = parsePx(styles.height, parsePx(styles.minHeight, 40))
              const transform = (styles.transform || '') as string
              const rotMatch = /rotate\(([-\d.]+)deg\)/.exec(transform)
              const angle = rotMatch ? parseFloat(rotMatch[1]) : 0
              const isSelected = selectedIndex === idx

              const onMouseDownMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
                e.stopPropagation()
                setSelectedIndex(idx)
                draggingRef.current = {
                  type: 'move',
                  startX: e.clientX,
                  startY: e.clientY,
                  startLeft: left,
                  startTop: top,
                  startWidth: width,
                  startHeight: height,
                  index: idx,
                }

                const snapThreshold = 6
                const onMove = (ev: MouseEvent) => {
                  const dX = (ev.clientX - (draggingRef.current?.startX || 0)) / scale
                  const dY = (ev.clientY - (draggingRef.current?.startY || 0)) / scale
                  let newLeft = (draggingRef.current?.startLeft || 0) + dX
                  let newTop = (draggingRef.current?.startTop || 0) + dY
                  // compute snapping against canvas and siblings
                  const vLines: number[] = [0, base.width / 2, base.width]
                  const hLines: number[] = [0, base.height / 2, base.height]
                  for (let j = 0; j < children.length; j++) {
                    if (j === idx) continue
                    const st = children[j].styles || {}
                    const l = parsePx(st.left, 0)
                    const t = parsePx(st.top, 0)
                    const w = parsePx(st.width, 100)
                    const h = parsePx(st.height, 40)
                    vLines.push(l, l + w / 2, l + w)
                    hLines.push(t, t + h / 2, t + h)
                  }
                  let gv: number[] = []
                  let gh: number[] = []
                  // left, center, right snapping
                  const candX = [newLeft, newLeft + width / 2, newLeft + width]
                  const candY = [newTop, newTop + height / 2, newTop + height]
                  vLines.forEach((line) => {
                    candX.forEach((cx, k) => {
                      if (Math.abs(cx - line) <= snapThreshold) {
                        if (k === 0) newLeft = line
                        if (k === 1) newLeft = line - width / 2
                        if (k === 2) newLeft = line - width
                        gv = [line]
                      }
                    })
                  })
                  hLines.forEach((line) => {
                    candY.forEach((cy, k) => {
                      if (Math.abs(cy - line) <= snapThreshold) {
                        if (k === 0) newTop = line
                        if (k === 1) newTop = line - height / 2
                        if (k === 2) newTop = line - height
                        gh = [line]
                      }
                    })
                  })
                  setGuides({ v: gv, h: gh })
                  updateChildStyles(idx, (st) => ({
                    ...st,
                    left: `${Math.round(newLeft)}px`,
                    top: `${Math.round(newTop)}px`,
                  }))
                }
                const onUp = () => {
                  draggingRef.current = null
                  setGuides({ v: [], h: [] })
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }

              const onMouseDownResize: React.MouseEventHandler<HTMLDivElement> = (e) => {
                e.stopPropagation()
                setSelectedIndex(idx)
                draggingRef.current = {
                  type: 'resize',
                  startX: e.clientX,
                  startY: e.clientY,
                  startLeft: left,
                  startTop: top,
                  startWidth: width,
                  startHeight: height,
                  index: idx,
                }

                const snapThreshold = 6
                const onMove = (ev: MouseEvent) => {
                  const dX = (ev.clientX - (draggingRef.current?.startX || 0)) / scale
                  const dY = (ev.clientY - (draggingRef.current?.startY || 0)) / scale
                  let newWidth = Math.max(1, (draggingRef.current?.startWidth || 0) + dX)
                  let newHeight = Math.max(1, (draggingRef.current?.startHeight || 0) + dY)
                  const vLines: number[] = [0, base.width / 2, base.width]
                  const hLines: number[] = [0, base.height / 2, base.height]
                  for (let j = 0; j < children.length; j++) {
                    if (j === idx) continue
                    const st = children[j].styles || {}
                    const l = parsePx(st.left, 0)
                    const t = parsePx(st.top, 0)
                    const w = parsePx(st.width, 100)
                    const h = parsePx(st.height, 40)
                    vLines.push(l, l + w / 2, l + w)
                    hLines.push(t, t + h / 2, t + h)
                  }
                  let gv: number[] = []
                  let gh: number[] = []
                  const right = left + newWidth
                  const bottom = top + newHeight
                  vLines.forEach((line) => {
                    if (Math.abs(right - line) <= snapThreshold) { newWidth = Math.max(1, line - left); gv = [line] }
                  })
                  // Vertical snapping for wl-day-section: quantize height to whole line increments
                  const targetChild = children[idx]
                  if (targetChild?.class === 'wl-day-section') {
                    // snap bottom to guides first (visual)
                    hLines.forEach((line) => {
                      if (Math.abs(bottom - line) <= snapThreshold) { newHeight = Math.max(1, line - top); gh = [line] }
                    })
                    // compute quantized height based on attributes
                    const attrs = targetChild.attributes || {}
                    const headerPx = Number(attrs['data-header'] ?? 85)
                    const spacingPx = Number(attrs['data-line-spacing'] ?? 25)
                    const bottomOffsetPx = Number(attrs['data-bottom-offset'] ?? 5)
                    const minLines = 1
                    const rawInner = Math.max(0, newHeight - headerPx - bottomOffsetPx)
                    let lines = Math.max(minLines, Math.round(rawInner / spacingPx))
                    // hard cap to avoid runaway sizes
                    lines = Math.min(lines, 60)
                    const quantizedHeight = headerPx + lines * spacingPx + bottomOffsetPx
                    setGuides({ v: gv, h: gh })
                    // update full node: styles.height, attributes, and SVG underlay lines
                    updateChildNode(idx, (node) => {
                      const next = { ...node }
                      next.attributes = { ...(next.attributes || {}), 'data-lines': lines }
                      next.styles = {
                        ...(next.styles || {}),
                        width: `${Math.round(newWidth)}px`,
                        height: `${Math.round(quantizedHeight)}px`,
                      }
                      const totalH = quantizedHeight
                      // rebuild svg child
                      const kids: any[] = Array.isArray(next.children) ? [...next.children] : []
                      const svgIdx = kids.findIndex((k) => k && k.component === 'svg')
                      if (svgIdx !== -1) {
                        const svg = { ...kids[svgIdx] }
                        svg.attributes = { ...(svg.attributes || {}), viewBox: `0 0 900 ${totalH}` }
                        const built: any[] = []
                        built.push({ component: 'circle', attributes: { cx: 67.5, cy: 70, r: 22.5, fill: 'currentColor', fillOpacity: 0.5 } })
                        // bottom divider
                        built.push({ component: 'line', attributes: { x1: 30, y1: totalH - bottomOffsetPx, x2: 900, y2: totalH - bottomOffsetPx, stroke: 'black', strokeWidth: 2 } })
                        for (let i = 0; i < lines; i++) {
                          const y = headerPx + i * spacingPx
                          built.push({ component: 'line', attributes: { x1: 45, y1: y, x2: 885, y2: y, stroke: 'black', strokeOpacity: 0.54 } })
                        }
                        svg.children = built
                        kids[svgIdx] = svg
                        next.children = kids
                      }
                      return next
                    })
                  } else {
                    // default behavior: free resize with guide snap
                    hLines.forEach((line) => {
                      if (Math.abs(bottom - line) <= snapThreshold) { newHeight = Math.max(1, line - top); gh = [line] }
                    })
                    setGuides({ v: gv, h: gh })
                    updateChildStyles(idx, (st) => ({
                      ...st,
                      width: `${Math.round(newWidth)}px`,
                      height: `${Math.round(newHeight)}px`,
                    }))
                  }
                }
                const onUp = () => {
                  draggingRef.current = null
                  setGuides({ v: [], h: [] })
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }

              const onMouseDownRotate: React.MouseEventHandler<HTMLDivElement> = (e) => {
                e.stopPropagation()
                setSelectedIndex(idx)
                // center of the box in client coords
                const canvasRect = canvasRef.current!.getBoundingClientRect()
                const cx = canvasRect.left + (left + width / 2) * scale
                const cy = canvasRect.top + (top + height / 2) * scale
                const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx)
                const baseAngle = angle * Math.PI / 180
                draggingRef.current = {
                  type: 'rotate',
                  startX: e.clientX,
                  startY: e.clientY,
                  startLeft: left,
                  startTop: top,
                  startWidth: width,
                  startHeight: height,
                  startAngle: baseAngle - startAngle,
                  index: idx,
                }
                const onMove = (ev: MouseEvent) => {
                  const curAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx)
                  let newDeg = (curAngle + (draggingRef.current?.startAngle || 0)) * 180 / Math.PI
                  // snap to 15° increments
                  const snap = 15
                  newDeg = Math.round(newDeg / snap) * snap
                  updateChildStyles(idx, (st) => ({
                    ...st,
                    transform: `rotate(${newDeg}deg)`
                  }))
                }
                const onUp = () => {
                  draggingRef.current = null
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }

              return (
                <div key={idx}
                  style={{ position: 'absolute', left, top, width, height, zIndex: 3 }}
                  onMouseDown={onMouseDownMove}
                >
                  {/* selection outline */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    border: isSelected ? '2px solid #3b82f6' : '1px dashed rgba(59,130,246,0.6)',
                    boxSizing: 'border-box',
                    pointerEvents: 'none',
                  }} />
                  {/* rotate handle (top-center) */}
                  <div
                    onMouseDown={onMouseDownRotate}
                    style={{
                      position: 'absolute', width: 12, height: 12,
                      top: -24, left: (width/2 - 6), background: '#fff',
                      border: '2px solid #3b82f6', borderRadius: '50%',
                      cursor: 'grab'
                    }}
                  />
                  {/* resize handle (bottom-right) */}
                  <div
                    onMouseDown={onMouseDownResize}
                    style={{
                      position: 'absolute', width: 10, height: 10,
                      right: -5, bottom: -5, background: '#3b82f6',
                      border: '1px solid #1d4ed8', borderRadius: 2,
                      cursor: 'nwse-resize',
                    }}
                  />
                </div>
              )
            })
          })()}
        </div>
      </div>
    </div>
  )
}

const PageTemplateEditor: React.FC = () => {
  const [name, setName] = useState('My Template')
  const [templateType, setTemplateType] = useState<TemplateType>('weekly_left')
  const [isDefault, setIsDefault] = useState(false)
  const [userId, setUserId] = useState('')
  const [plannerId, setPlannerId] = useState('')
  const [content, setContent] = useState<TemplateContent>(() => makeStarter('weekly_left'))
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const canvasApiRef = useRef<null | { placeAtClient: (block: BlockId, x: number, y: number) => void; getCanvasRect: () => DOMRect | null }>(null)
  const [ghost, setGhost] = useState<null | { block: BlockId; x: number; y: number; overCanvas: boolean }>(null)

  // Keep metadata.type in sync with selection
  useEffect(() => {
    setContent((c) => ({ ...c, metadata: { ...c.metadata, type: templateType } }))
  }, [templateType])

  const onChooseStarter = (t: TemplateType) => {
    setTemplateType(t)
    setContent(makeStarter(t))
  }

  const onSave = async () => {
    try {
      await savePageTemplate({
        name,
        template_type: templateType,
        is_default: isDefault,
        user_id: userId,
        planner_id: plannerId,
        content,
      })
      alert('Saved!')
    } catch (e: any) {
      console.error(e)
      alert(`Save failed: ${e?.message || e}`)
    }
  }

  const onCopy = () => {
    const json = JSON.stringify(content, null, 2)
    navigator.clipboard.writeText(json)
  }

  const onDownload = () => {
    const json = JSON.stringify(content, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name || 'page_template'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // custom DnD from palette to canvas to support WebView
  const startGhostDrag = (block: BlockId, startEvent: React.MouseEvent) => {
    startEvent.preventDefault()
    const update = (ev: MouseEvent) => {
      const rect = canvasApiRef.current?.getCanvasRect()
      const over = rect ? (ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom) : false
      setGhost({ block, x: ev.clientX, y: ev.clientY, overCanvas: over })
    }
    const up = (ev: MouseEvent) => {
      const rect = canvasApiRef.current?.getCanvasRect()
      const over = rect ? (ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom) : false
      if (over && canvasApiRef.current) {
        canvasApiRef.current.placeAtClient(block, ev.clientX, ev.clientY)
      }
      setGhost(null)
      window.removeEventListener('mousemove', update)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', update)
    window.addEventListener('mouseup', up)
    // initialize
    update(startEvent.nativeEvent as unknown as MouseEvent)
  }

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      <div style={{ width: 240, borderRight: '1px solid #eee', padding: 12 }}>
        <h3 style={{ margin: 0 }}>Assets</h3>
        <div style={{ fontSize: 12, opacity: 0.7, margin: '8px 0' }}>Starters</div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
          <button onClick={() => onChooseStarter('weekly_left')}>Weekly Left</button>
          <button onClick={() => onChooseStarter('weekly_right')}>Weekly Right</button>
          <button onClick={() => onChooseStarter('daily')}>Daily</button>
          <button onClick={() => onChooseStarter('monthly')}>Monthly</button>
          <button onClick={() => onChooseStarter('extra')}>Extra</button>
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Blocks (drag to place)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          {BLOCK_PALETTE.map((b) => (
            <div
              key={b.id}
              onMouseDown={(e) => startGhostDrag(b.id, e)}
              style={{
                padding: 8,
                border: '1px solid #ddd',
                background: '#fff',
                borderRadius: 6,
                cursor: 'grab',
              }}
            >
              <div style={{ fontWeight: 600 }}>{b.label}</div>
              {b.hint && <div style={{ fontSize: 12, opacity: 0.6 }}>{b.hint}</div>}
            </div>
          ))}
        </div>
      </div>
      <Canvas
        content={content}
        setContent={setContent}
        plannerId={plannerId}
        selectedIndex={selectedIndex}
        setSelectedIndex={setSelectedIndex}
        registerCanvasApi={(api) => { canvasApiRef.current = api }}
      />
      <RightSidebar
        name={name}
        setName={setName}
        templateType={templateType}
        setTemplateType={setTemplateType}
        isDefault={isDefault}
        setIsDefault={setIsDefault}
        userId={userId}
        setUserId={setUserId}
        plannerId={plannerId}
        setPlannerId={setPlannerId}
        content={content}
        setContent={setContent}
        selectedIndex={selectedIndex}
        setSelectedIndex={setSelectedIndex}
        onSave={onSave}
        onCopy={onCopy}
        onDownload={onDownload}
      />
      {ghost && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 9999 }}>
          <div style={{ position: 'absolute', left: ghost.x + 12, top: ghost.y + 12, padding: '6px 8px', background: ghost.overCanvas ? '#10b981' : '#111827', color: '#fff', borderRadius: 6, fontSize: 12 }}>
            {ghost.overCanvas ? 'Drop to place' : 'Drag over canvas'}: {ghost.block}
          </div>
        </div>
      )}
    </div>
  )
}

export default PageTemplateEditor

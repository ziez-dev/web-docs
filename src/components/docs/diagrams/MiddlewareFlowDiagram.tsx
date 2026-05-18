import { useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  type Node,
  type Edge,
  Position,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { FitViewOnResize } from '@/components/docs/diagrams/FitViewOnResize'

const nodeStyle = {
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  padding: '12px 24px',
  border: 'none',
  minWidth: 150,
  textAlign: 'center' as const,
}

const COL = 250
const ROW_REQ = 0
const ROW_RES = 140
const LABEL_ARROW = '→'
const LABEL_ARROW_LEFT = '←'

const nodes: Node[] = [
  {
    id: 'client',
    position: { x: 0, y: ROW_REQ },
    data: { label: 'Client' },
    sourcePosition: Position.Right,
    targetPosition: Position.Right,
    style: {
      ...nodeStyle,
      background: '#06b6d4',
      color: '#fff',
      boxShadow: '0 4px 14px rgba(6, 182, 212, 0.35)',
    },
  },
  {
    id: 'mw1',
    position: { x: COL, y: ROW_REQ },
    data: { label: 'Middleware 1' },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      ...nodeStyle,
      background: '#0e7490',
      color: '#fff',
    },
  },
  {
    id: 'mw2',
    position: { x: COL * 2, y: ROW_REQ },
    data: { label: 'Middleware 2' },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      ...nodeStyle,
      background: '#155e75',
      color: '#ecfeff',
    },
  },
  {
    id: 'handler',
    position: { x: COL * 3, y: ROW_REQ },
    data: { label: 'Handler' },
    sourcePosition: Position.Left,
    targetPosition: Position.Left,
    style: {
      ...nodeStyle,
      background: '#22d3ee',
      color: '#164e63',
      boxShadow: '0 4px 14px rgba(34, 211, 238, 0.35)',
    },
  },
  {
    id: 'handler-ret',
    position: { x: COL * 3, y: ROW_RES },
    data: { label: 'Handler' },
    sourcePosition: Position.Left,
    targetPosition: Position.Left,
    style: {
      ...nodeStyle,
      background: '#22d3ee',
      color: '#164e63',
    },
  },
  {
    id: 'mw2-ret',
    position: { x: COL * 2, y: ROW_RES },
    data: { label: 'Middleware 2' },
    sourcePosition: Position.Left,
    targetPosition: Position.Right,
    style: {
      ...nodeStyle,
      background: '#155e75',
      color: '#ecfeff',
    },
  },
  {
    id: 'mw1-ret',
    position: { x: COL, y: ROW_RES },
    data: { label: 'Middleware 1' },
    sourcePosition: Position.Left,
    targetPosition: Position.Right,
    style: {
      ...nodeStyle,
      background: '#0e7490',
      color: '#fff',
    },
  },
  {
    id: 'client-ret',
    position: { x: 0, y: ROW_RES },
    data: { label: 'Client' },
    sourcePosition: Position.Right,
    targetPosition: Position.Right,
    style: {
      ...nodeStyle,
      background: '#22d3ee',
      color: '#164e63',
      boxShadow: '0 4px 14px rgba(34, 211, 238, 0.35)',
    },
  },
]

const edgeDefaults = {
  style: { strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed },
}

const reqLabelStyle = { fontSize: 11, fill: '#67e8f9', fontWeight: 600 }
const resLabelStyle = { fontSize: 11, fill: '#67e8f9', fontWeight: 600 }
const monoLabelStyle = { ...reqLabelStyle, fontFamily: 'ui-monospace, monospace' }

const edges: Edge[] = [
  {
    id: 'req1',
    source: 'client',
    target: 'mw1',
    label: `Request ${LABEL_ARROW}`,
    animated: true,
    ...edgeDefaults,
    style: { ...edgeDefaults.style, stroke: '#06b6d4' },
    labelStyle: reqLabelStyle,
    labelBgStyle: { fill: '#1e293b', fillOpacity: 0.85 },
    labelBgPadding: [6, 4] as [number, number],
    labelBgBorderRadius: 6,
  },
  {
    id: 'req2',
    source: 'mw1',
    target: 'mw2',
    label: `next() ${LABEL_ARROW}`,
    animated: true,
    ...edgeDefaults,
    style: { ...edgeDefaults.style, stroke: '#0891b2' },
    labelStyle: monoLabelStyle,
    labelBgStyle: { fill: '#1e293b', fillOpacity: 0.85 },
    labelBgPadding: [6, 4] as [number, number],
    labelBgBorderRadius: 6,
  },
  {
    id: 'req3',
    source: 'mw2',
    target: 'handler',
    label: `next() ${LABEL_ARROW}`,
    animated: true,
    ...edgeDefaults,
    style: { ...edgeDefaults.style, stroke: '#0e7490' },
    labelStyle: monoLabelStyle,
    labelBgStyle: { fill: '#1e293b', fillOpacity: 0.85 },
    labelBgPadding: [6, 4] as [number, number],
    labelBgBorderRadius: 6,
  },
  {
    id: 'res3',
    source: 'handler-ret',
    target: 'mw2-ret',
    label: `${LABEL_ARROW_LEFT} Response`,
    ...edgeDefaults,
    style: { ...edgeDefaults.style, stroke: '#22d3ee', strokeDasharray: '6 3' },
    labelStyle: resLabelStyle,
    labelBgStyle: { fill: '#1e293b', fillOpacity: 0.85 },
    labelBgPadding: [6, 4] as [number, number],
    labelBgBorderRadius: 6,
  },
  {
    id: 'res2',
    source: 'mw2-ret',
    target: 'mw1-ret',
    label: `${LABEL_ARROW_LEFT} Response`,
    ...edgeDefaults,
    style: { ...edgeDefaults.style, stroke: '#22d3ee', strokeDasharray: '6 3' },
    labelStyle: resLabelStyle,
    labelBgStyle: { fill: '#1e293b', fillOpacity: 0.85 },
    labelBgPadding: [6, 4] as [number, number],
    labelBgBorderRadius: 6,
  },
  {
    id: 'res1',
    source: 'mw1-ret',
    target: 'client-ret',
    label: `${LABEL_ARROW_LEFT} Response`,
    ...edgeDefaults,
    style: { ...edgeDefaults.style, stroke: '#22d3ee', strokeDasharray: '6 3' },
    labelStyle: resLabelStyle,
    labelBgStyle: { fill: '#1e293b', fillOpacity: 0.85 },
    labelBgPadding: [6, 4] as [number, number],
    labelBgBorderRadius: 6,
  },
]

export function MiddlewareFlowDiagram() {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <ReactFlowProvider>
      <div ref={containerRef} className="react-flow-wrapper not-prose my-8 h-[340px] w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
        >
          <Background color="#a1a1aa" gap={20} size={1} />
          <FitViewOnResize containerRef={containerRef} />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  )
}

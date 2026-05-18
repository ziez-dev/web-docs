import { useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  type Node,
  type Edge,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { FitViewOnResize } from '@/components/docs/diagrams/FitViewOnResize'

const nodeDefaults = {
  sourcePosition: Position.Bottom,
  targetPosition: Position.Top,
  style: {
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    padding: '10px 20px',
    border: 'none',
    minWidth: 160,
    textAlign: 'center' as const,
  },
}

const nodes: Node[] = [
  {
    id: 'request',
    position: { x: 150, y: 0 },
    data: { label: 'Client Request' },
    ...nodeDefaults,
    style: {
      ...nodeDefaults.style,
      background: '#06b6d4',
      color: '#fff',
      boxShadow: '0 4px 14px rgba(6, 182, 212, 0.35)',
    },
  },
  {
    id: 'middleware',
    position: { x: 150, y: 80 },
    data: { label: 'Middleware Chain' },
    ...nodeDefaults,
    style: {
      ...nodeDefaults.style,
      background: '#0e7490',
      color: '#fff',
    },
  },
  {
    id: 'interceptors',
    position: { x: 150, y: 160 },
    data: { label: 'Interceptors' },
    ...nodeDefaults,
    style: {
      ...nodeDefaults.style,
      background: '#155e75',
      color: '#ecfeff',
    },
  },
  {
    id: 'validation',
    position: { x: 150, y: 240 },
    data: { label: 'Validation Pipes' },
    ...nodeDefaults,
    style: {
      ...nodeDefaults.style,
      background: '#164e63',
      color: '#ecfeff',
    },
  },
  {
    id: 'handler',
    position: { x: 150, y: 320 },
    data: { label: 'Route Handler' },
    ...nodeDefaults,
    style: {
      ...nodeDefaults.style,
      background: '#0891b2',
      color: '#fff',
      boxShadow: '0 4px 14px rgba(8, 145, 178, 0.3)',
    },
  },
  {
    id: 'serialization',
    position: { x: 150, y: 400 },
    data: { label: 'Serialization' },
    ...nodeDefaults,
    style: {
      ...nodeDefaults.style,
      background: '#155e75',
      color: '#ecfeff',
    },
  },
  {
    id: 'response',
    position: { x: 150, y: 480 },
    data: { label: 'Response' },
    ...nodeDefaults,
    style: {
      ...nodeDefaults.style,
      background: '#22d3ee',
      color: '#164e63',
      boxShadow: '0 4px 14px rgba(34, 211, 238, 0.35)',
    },
  },
]

const edges: Edge[] = [
  { id: 'e1', source: 'request', target: 'middleware', animated: true, style: { stroke: '#06b6d4' } },
  { id: 'e2', source: 'middleware', target: 'interceptors', animated: true, style: { stroke: '#0891b2' } },
  { id: 'e3', source: 'interceptors', target: 'validation', animated: true, style: { stroke: '#0e7490' } },
  { id: 'e4', source: 'validation', target: 'handler', animated: true, style: { stroke: '#155e75' } },
  { id: 'e5', source: 'handler', target: 'serialization', animated: true, style: { stroke: '#0891b2' } },
  { id: 'e6', source: 'serialization', target: 'response', animated: true, style: { stroke: '#06b6d4' } },
]

export function ArchitectureFlowDiagram() {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <ReactFlowProvider>
      <div ref={containerRef} className="react-flow-wrapper not-prose my-8 h-[580px] w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
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

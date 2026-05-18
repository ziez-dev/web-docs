import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'

export function FitViewOnResize({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { fitView } = useReactFlow()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(() => {
      fitView({ padding: 0.3, duration: 200 })
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [fitView, containerRef])

  return null
}

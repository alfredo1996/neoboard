import { useEffect, useRef, useState } from 'react'

interface Size {
  width: number
  height: number
}

/**
 * Hook to measure container size using ResizeObserver
 * Returns a ref to attach to the container and the current size
 */
export function useContainerSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const resizeObserver = new ResizeObserver(() => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      })
    })

    resizeObserver.observe(element)

    // Set initial size
    setSize({
      width: element.clientWidth,
      height: element.clientHeight,
    })

    return () => resizeObserver.disconnect()
  }, [])

  return [ref, size] as const
}

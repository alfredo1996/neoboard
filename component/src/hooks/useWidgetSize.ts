import { createContext, useContext } from 'react'

interface Size {
  width: number
  height: number
}

const WidgetSizeContext = createContext<Size | null>(null)

export function useWidgetSize() {
  const size = useContext(WidgetSizeContext)
  if (!size) {
    throw new Error('useWidgetSize must be used within WidgetSizeProvider')
  }
  return size
}

export function WidgetSizeProvider({ value, children }: { value: Size; children: React.ReactNode }) {
  return <WidgetSizeContext.Provider value={value}>{children}</WidgetSizeContext.Provider>
}

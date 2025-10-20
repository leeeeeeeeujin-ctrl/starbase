import { useCallback, useRef, useState } from 'react'

export default function useInfoSlider({ maxIndex = 1 }) {
  const [index, setIndex] = useState(0)
  const touchStartRef = useRef(null)

  const clampIndex = useCallback(
    (next) => {
      if (next < 0) return 0
      if (next > maxIndex) return maxIndex
      return next
    },
    [maxIndex],
  )

  const handleTouchStart = useCallback((event) => {
    if (!event.touches?.length) return
    touchStartRef.current = event.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback(
    (event) => {
      if (!event.changedTouches?.length) return
      const startX = touchStartRef.current
      touchStartRef.current = null
      if (typeof startX !== 'number') return
      const delta = event.changedTouches[0].clientX - startX
      if (Math.abs(delta) < 40) return
      setIndex((prev) => clampIndex(prev + (delta > 0 ? -1 : 1)))
    },
    [clampIndex],
  )

  const handlePointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse') return
    touchStartRef.current = event.clientX
  }, [])

  const handlePointerUp = useCallback(
    (event) => {
      if (event.pointerType === 'mouse') return
      const startX = touchStartRef.current
      touchStartRef.current = null
      if (typeof startX !== 'number') return
      const delta = event.clientX - startX
      if (Math.abs(delta) < 40) return
      setIndex((prev) => clampIndex(prev + (delta > 0 ? -1 : 1)))
    },
    [clampIndex],
  )

  const handleIndicatorClick = useCallback((nextIndex) => {
    setIndex(clampIndex(nextIndex))
  }, [clampIndex])

  return {
    index,
    setIndex,
    handleTouchStart,
    handleTouchEnd,
    handlePointerDown,
    handlePointerUp,
    handleIndicatorClick,
  }
}

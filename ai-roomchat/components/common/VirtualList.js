import React, { useMemo, useRef, useState, memo } from 'react';

function VirtualList({
  count,
  itemHeight = 40,
  height = 300,
  overscan = 6,
  renderItem,
  style,
}) {
  const ref = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const onScroll = (e) => setScrollTop(e.currentTarget.scrollTop);
  const totalHeight = count * itemHeight;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const end = Math.min(count - 1, Math.ceil((scrollTop + height) / itemHeight) + overscan);
  const items = useMemo(() => {
    const out = [];
    for (let i = start; i <= end; i++) out.push(i);
    return out;
  }, [start, end]);
  const paddingTop = start * itemHeight;
  const paddingBottom = Math.max(0, totalHeight - paddingTop - (items.length * itemHeight));
  return (
    <div ref={ref} onScroll={onScroll} style={{ height, overflow: 'auto', ...style }}>
      <div style={{ paddingTop, paddingBottom }}>
        {items.map(i => (
          <div key={i} style={{ height: itemHeight }}>
            {renderItem(i)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(VirtualList);

import { useEffect, useState } from 'react';

export function useScrolling(selectedIndex: number, maxVisibleItems: number) {
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + maxVisibleItems) {
      setScrollOffset(selectedIndex - maxVisibleItems + 1);
    }
  }, [selectedIndex, maxVisibleItems, scrollOffset]);

  return scrollOffset;
}

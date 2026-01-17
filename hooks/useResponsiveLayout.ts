import { useMemo } from 'react';
import { useTerminalDimensions } from '@opentui/react';

export interface ResponsiveLayout {
  maxVisibleItems: number;
  showBreadcrumbs: boolean;
  showHelp: boolean;
  truncateAt: number;
  isCompact: boolean;
  minimalMode: boolean;
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { height, width } = useTerminalDimensions();

  const layout = useMemo(() => {
    const isNarrow = width < 80;
    const isShort = height < 20;
    const isTiny = height < 10 || width < 40;

    return {
      maxVisibleItems: Math.max(5, height - 6),
      showBreadcrumbs: !isShort && !isTiny,
      showHelp: !isShort && !isTiny,
      truncateAt: Math.max(20, width - 20),
      isCompact: isNarrow || isShort,
      minimalMode: isTiny,
    };
  }, [height, width]);

  return layout;
}

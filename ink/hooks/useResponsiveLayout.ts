import {useStdout} from 'ink';
import {useMemo} from 'react';

export interface ResponsiveLayout {
  maxVisibleItems: number;
  showBreadcrumbs: boolean;
  showHelp: boolean;
  truncateAt: number;
  isCompact: boolean;
  isNarrow: boolean;
  isShort: boolean;
  minimalMode: boolean;
  width: number;
  height: number;
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const height = stdout?.rows ?? 24;

  return useMemo(() => {
    const isNarrow = width < 80;
    const isShort = height < 20;
    const isTiny = height < 10 || width < 40;

    return {
      maxVisibleItems: Math.max(5, height - 6),
      showBreadcrumbs: !isShort && !isTiny,
      showHelp: !isShort && !isTiny,
      truncateAt: Math.max(20, width - 20),
      isCompact: isNarrow || isShort,
      isNarrow,
      isShort,
      minimalMode: isTiny,
      width,
      height,
    };
  }, [height, width]);
}

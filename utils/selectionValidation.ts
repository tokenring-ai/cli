export function canSelect(
  value: string,
  checked: Set<string>,
  minimumSelections?: number,
  maximumSelections?: number
): boolean {
  const isCurrentlySelected = checked.has(value);

  if (isCurrentlySelected) {
    if (minimumSelections !== undefined && checked.size <= minimumSelections) {
      return false;
    }
    return true;
  } else {
    if (maximumSelections !== undefined && checked.size >= maximumSelections) {
      return false;
    }
    return true;
  }
}

export function isSelectionValid(
  checked: Set<string>,
  minimumSelections?: number,
  maximumSelections?: number
): boolean {
  const count = checked.size;
  if (minimumSelections !== undefined && count < minimumSelections) {
    return false;
  }
  if (maximumSelections !== undefined && count > maximumSelections) {
    return false;
  }
  return true;
}

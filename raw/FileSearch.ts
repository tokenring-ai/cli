type FileSearchToken = {
  start: number;
  end: number;
  query: string;
};

const PATH_SEPARATORS = new Set(["/", "-", "_", "."]);
const COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isWhitespace(char: string | undefined): boolean {
  return typeof char === "string" && /\s/.test(char);
}

function getBaseName(filePath: string): string {
  const separatorIndex = filePath.lastIndexOf("/");
  return separatorIndex === -1 ? filePath : filePath.slice(separatorIndex + 1);
}

function getPathDepth(filePath: string): number {
  return filePath.split("/").length - 1;
}

export function compareFilePathsForBrowsing(left: string, right: string): number {
  const depthDifference = getPathDepth(left) - getPathDepth(right);
  if (depthDifference !== 0) return depthDifference;

  const baseNameDifference = COLLATOR.compare(getBaseName(left), getBaseName(right));
  if (baseNameDifference !== 0) return baseNameDifference;

  const lengthDifference = left.length - right.length;
  if (lengthDifference !== 0) return lengthDifference;

  return COLLATOR.compare(left, right);
}

export function findActiveFileSearchToken(text: string, cursor: number): FileSearchToken | null {
  const boundedCursor = clamp(cursor, 0, text.length);
  let start = boundedCursor;
  let end = boundedCursor;

  while (start > 0 && !isWhitespace(text[start - 1])) {
    start -= 1;
  }

  while (end < text.length && !isWhitespace(text[end])) {
    end += 1;
  }

  const token = text.slice(start, end);
  if (!token.startsWith("@") || token.indexOf("@", 1) !== -1) {
    return null;
  }

  return {
    start,
    end,
    query: token.slice(1),
  };
}

export function scoreFileSearchMatch(filePath: string, query: string): number {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedPath = filePath.toLowerCase();
  const baseName = getBaseName(normalizedPath);

  if (normalizedQuery.length === 0) {
    return 1_000_000 - (getPathDepth(filePath) * 1000) - normalizedPath.length;
  }

  let score = 0;

  if (baseName === normalizedQuery) {
    score += 120_000;
  }

  if (baseName.startsWith(normalizedQuery)) {
    score += 60_000 - baseName.length;
  }

  const baseNameIndex = baseName.indexOf(normalizedQuery);
  if (baseNameIndex !== -1) {
    score += 40_000 - (baseNameIndex * 200);
  }

  const pathIndex = normalizedPath.indexOf(normalizedQuery);
  if (pathIndex !== -1) {
    score += 20_000 - (pathIndex * 50);
  }

  let lastMatchIndex = -1;
  let consecutiveMatches = 0;

  for (const char of normalizedQuery) {
    const nextMatchIndex = normalizedPath.indexOf(char, lastMatchIndex + 1);
    if (nextMatchIndex === -1) {
      return Number.NEGATIVE_INFINITY;
    }

    score += 1000;

    if (nextMatchIndex === lastMatchIndex + 1) {
      consecutiveMatches += 1;
      score += consecutiveMatches * 350;
    } else {
      consecutiveMatches = 0;
    }

    const previousChar = nextMatchIndex === 0 ? "/" : normalizedPath[nextMatchIndex - 1];
    if (PATH_SEPARATORS.has(previousChar)) {
      score += 650;
    }

    if (nextMatchIndex >= normalizedPath.length - baseName.length) {
      score += 500;
    }

    lastMatchIndex = nextMatchIndex;
  }

  score -= normalizedPath.length * 8;
  score -= getPathDepth(filePath) * 120;

  return score;
}

export function getFileSearchMatches(
  filePaths: readonly string[],
  query: string,
  limit = 8,
): string[] {
  const maxResults = Math.max(0, limit);
  const normalizedQuery = query.trim();
  if (maxResults === 0) {
    return [];
  }

  return filePaths
    .map((filePath) => ({
      filePath,
      score: scoreFileSearchMatch(filePath, normalizedQuery),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;
      if (scoreDifference !== 0) return scoreDifference;
      return compareFilePathsForBrowsing(left.filePath, right.filePath);
    })
    .slice(0, maxResults)
    .map((candidate) => candidate.filePath);
}

export function replaceFileSearchToken(
  text: string,
  token: FileSearchToken,
  replacement: string,
): {text: string; cursor: number} {
  const prefix = text.slice(0, token.start);
  const suffix = text.slice(token.end);
  const insertion = suffix.length === 0 ? `${replacement} ` : replacement;
  return {
    text: `${prefix}${insertion}${suffix}`,
    cursor: prefix.length + insertion.length,
  };
}

export type {FileSearchToken};

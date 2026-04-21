export type CommandDefinition = {
  name: string;
  description: string;
};

export type CommandCompletionContext = {
  query: string;
  matches: CommandDefinition[];
  replacementStart: number;
  replacementEnd: number;
};

export function getLongestCommonPrefix(values: string[]): string {
  if (values.length === 0) return "";

  let prefix = values[0] ?? "";
  for (const value of values.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < value.length && prefix[index] === value[index]) {
      index += 1;
    }
    prefix = prefix.slice(0, index);
    if (prefix.length === 0) break;
  }

  return prefix;
}

export function getCommandCompletionContext(input: string, cursor: number, commands: CommandDefinition[]): CommandCompletionContext | null {
  const currentLine = input.slice(0, cursor);
  const lineStart = currentLine.lastIndexOf("\n") + 1;
  if (lineStart !== 0) return null;

  const commandPrefix = currentLine.slice(lineStart);
  if (!commandPrefix.startsWith("/")) return null;

  const query = commandPrefix.slice(1);
  const matches = commands.filter(command => command.name.startsWith(query));
  if (matches.length === 0) return null;

  return {
    query,
    matches,
    replacementStart: lineStart,
    replacementEnd: cursor,
  };
}

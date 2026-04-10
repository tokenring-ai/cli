import chalk from "chalk";
import process from "node:process";

function applyInlineStyles(text: string): string {
  let result = text;
  result = result.replace(/\*\*(.*?)\*\*/g, (_, content) =>
    chalk.bold(content),
  );
  result = result.replace(/(?<![\w])__(.*?)__(?![\w])/g, (_, content) =>
    chalk.bold(content),
  );
  result = result.replace(/\*(.*?)\*/g, (_, content) => chalk.italic(content));
  result = result.replace(/(?<![\w])_(.*?)_(?![\w])/g, (_, content) =>
    chalk.italic(content),
  );
  result = result.replace(/~~(.*?)~~/g, (_, content) =>
    chalk.strikethrough(content),
  );
  result = result.replace(/`(.*?)`/g, (_, content) =>
    chalk.bgWhite.black(` ${content} `),
  );
  result = result.replace(
    /\[(.*?)\]\((.*?)\)/g,
    (_, text, url) => `${chalk.cyan.underline(text)} ${chalk.gray(`(${url})`)}`,
  );
  return result;
}

export default function applyMarkdownStyles(text: string): string {
  let result = text;

  // Code blocks (triple backticks) - convert to 20char horizontal line
  if (result.trim().startsWith("```")) {
    const lang = result.trim().slice(3).trim();
    const line = lang
      ? "─── " + lang + " " + "─".repeat(35 - lang.length)
      : "─".repeat(40);
    return chalk.gray(line);
  }

  // Horizontal Rules (---, ***, ___)
  if (result.trim().match(/^([-*_])\1{2,}$/)) {
    const width = process.stdout.columns
      ? Math.floor(process.stdout.columns * 0.6)
      : 40;
    return chalk.gray("─".repeat(width));
  }

  // Unordered Lists (*, -, +)
  const unorderedListMatch = result.match(/^(\s*)([*+-])\s+(.*)$/);
  if (unorderedListMatch) {
    const [_, indent, bullet, content] = unorderedListMatch;
    return `${indent}${chalk.yellow(bullet)} ${applyInlineStyles(content)}`;
  }

  // Ordered Lists (1., 2., etc)
  const orderedListMatch = result.match(/^(\s*)(\d+\.)\s+(.*)$/);
  if (orderedListMatch) {
    const [_, indent, number, content] = orderedListMatch;
    return `${indent}${chalk.yellow(number)} ${applyInlineStyles(content)}`;
  }

  // Headings (e.g., # Heading) - Bold + Underline
  if (result.trimStart().startsWith("#")) {
    result = result.replace(/^(\s*)(#+)\s+(.*)$/, (_, indent, __, content) => {
      return `${indent}${chalk.bold.underline(applyInlineStyles(content))}`;
    });
  }
  // Blockquotes (>)
  if (result.trim().startsWith(">")) {
    result = result.replace(/^(\s*)>\s?(.*)$/, (_, indent, content) => {
      return `${indent}${chalk.gray("┃")} ${chalk.italic.gray(applyInlineStyles(content))}`;
    });
  }
  // Bold (**text** or __text__) - for __, require word boundaries
  // Italic (*text* or _text_) - for _, require word boundaries to avoid mid-word matches
  // Strikethrough, inline code, links
  result = applyInlineStyles(result);

  return result;
}

import chalk from "chalk";
import process from "node:process";

export default function applyMarkdownStyles(text: string): string {
  let result = text;

  // Code blocks (triple backticks) - convert to 20char horizontal line
  if (result.trim().startsWith('```')) {
    const lang = result.trim().slice(3).trim();
    const line = lang
      ? "─── " + lang + " " + "─".repeat(35 - lang.length)
      : "─".repeat(40);
    return lang ? chalk.gray(line) : chalk.gray(line);
  }

  // Horizontal Rules (---, ***, ___)
  if (result.trim().match(/^([-*_])\1{2,}$/)) {
    const width = process.stdout.columns ? Math.floor(process.stdout.columns * 0.6) : 40;
    return chalk.gray("─".repeat(width));
  }

  // Unordered Lists (*, -, +)
  const unorderedListMatch = result.match(/^(\s*)([*+-])\s+(.*)$/);
  if (unorderedListMatch) {
    const [_, indent, bullet, content] = unorderedListMatch;
    return `${indent}${chalk.yellow(bullet)} ${content}`;
  }

  // Ordered Lists (1., 2., etc)
  const orderedListMatch = result.match(/^(\s*)(\d+\.)\s+(.*)$/);
  if (orderedListMatch) {
    const [_, indent, number, content] = orderedListMatch;
    return `${indent}${chalk.yellow(number)} ${content}`;
  }

  // Headings (e.g., # Heading) - Bold + Underline
  if (result.startsWith('#')) {
    result = result.replace(/^(#+)\s+(.*)$/, (_, __, content) => {
      return chalk.bold.underline(content);
    });
  }
  // Blockquotes (>)
  if (result.trim().startsWith('>')) {
    result = result.replace(/^(\s*)>\s?(.*)$/, (_, indent, content) => {
      return `${indent}${chalk.gray('┃')} ${chalk.italic.gray(content)}`;
    });
  }
  // Bold (**text** or __text__)
  result = result.replace(/(\*\*|__)(.*?)\1/g, (_, __, content) => chalk.bold(content));
  // Italic (*text* or _text_)
  result = result.replace(/(\*|_)(.*?)\1/g, (_, __, content) => chalk.italic(content));
  // Strikethrough (~~text~~)
  result = result.replace(/~~(.*?)~~/g, (_, content) => chalk.strikethrough(content));
  // Inline code (`text`)
  result = result.replace(/`(.*?)`/g, (_, content) => chalk.bgWhite.black(` ${content} `));
  // Links ([text](url))
  result = result.replace(/\[(.*?)\]\((.*?)\)/g, (_, text, url) => {
    return `${chalk.cyan.underline(text)} ${chalk.gray(`(${url})`)}`;
  });

  return result;
}
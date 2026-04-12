import {type CommandDefinition, getCommandCompletionContext, getLongestCommonPrefix} from "./CommandCompletions.ts";

const commands: CommandDefinition[] = [
  {name: "model get", description: "Get the current model"},
  {name: "model set", description: "Set the current model"},
  {name: "model select", description: "Select a model interactively"},
];

describe("CommandCompletions", () => {
  it("computes the shared prefix for nested commands", () => {
    expect(getLongestCommonPrefix(["model set", "model select"])).toBe("model se");
  });

  it("matches slash commands on the first input line", () => {
    const context = getCommandCompletionContext("/model s", "/model s".length, commands);

    expect(context?.query).toBe("model s");
    expect(context?.matches.map((command) => command.name)).toEqual([
      "model set",
      "model select",
    ]);
  });

  it("ignores non-command input", () => {
    expect(getCommandCompletionContext("hello", 5, commands)).toBeNull();
  });

  it("ignores later lines in a multiline buffer", () => {
    expect(getCommandCompletionContext("/model\nset", "/model\nset".length, commands)).toBeNull();
  });
});

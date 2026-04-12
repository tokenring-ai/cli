import {compareFilePathsForBrowsing, findActiveFileSearchToken, getFileSearchMatches, replaceFileSearchToken} from "./FileSearch.ts";

describe("FileSearch", () => {
  it("finds the active @ token at the cursor", () => {
    expect(findActiveFileSearchToken("Review @pkg/cli/raw", "Review @pkg/cli/raw".length)).toEqual({
      start: 7,
      end: 19,
      query: "pkg/cli/raw",
    });
  });

  it("ignores email-like text", () => {
    expect(findActiveFileSearchToken("me@example.com", "me@example.com".length)).toBeNull();
  });

  it("prefers basename and subsequence matches", () => {
    const matches = getFileSearchMatches([
      "README.md",
      "pkg/cli/raw/RawChatUI.ts",
      "pkg/cli/raw/InputEditor.ts",
      "pkg/cli/README.md",
    ], "rawc", 3);

    expect(matches[0]).toBe("pkg/cli/raw/RawChatUI.ts");
  });

  it("sorts shallower files first when the query is empty", () => {
    const paths = [
      "pkg/cli/raw/InputEditor.ts",
      "README.md",
      "pkg/cli/README.md",
    ];

    expect([...paths].sort(compareFilePathsForBrowsing)).toEqual([
      "README.md",
      "pkg/cli/README.md",
      "pkg/cli/raw/InputEditor.ts",
    ]);
  });

  it("replaces the active token with the selected path", () => {
    const token = findActiveFileSearchToken("Open @rawchat", "Open @rawchat".length);
    expect(token).not.toBeNull();

    expect(replaceFileSearchToken("Open @rawchat", token!, "pkg/cli/raw/RawChatUI.ts")).toEqual({
      text: "Open pkg/cli/raw/RawChatUI.ts ",
      cursor: "Open pkg/cli/raw/RawChatUI.ts ".length,
    });
  });
});

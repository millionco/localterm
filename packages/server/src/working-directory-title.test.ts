import { describe, expect, it } from "vitest";
import { formatWorkingDirectoryTitle } from "./working-directory-title.js";

describe("formatWorkingDirectoryTitle", () => {
  const home = "/Users/tester";

  it("uses zsh-style home abbreviation", () => {
    expect(formatWorkingDirectoryTitle(home, home)).toBe("~");
    expect(formatWorkingDirectoryTitle("/Users/tester/Developer/localterm", home)).toBe(
      "~/Developer/localterm",
    );
  });

  it("keeps paths with three or fewer display segments whole", () => {
    expect(formatWorkingDirectoryTitle("/usr/local/bin", home)).toBe("/usr/local/bin");
  });

  it("truncates deep paths to the last three display segments", () => {
    expect(formatWorkingDirectoryTitle("/Users/tester/Developer/localterm/packages/server", home)).toBe(
      "…/localterm/packages/server",
    );
  });
});

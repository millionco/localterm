import { describe, expect, it } from "vitest";
import {
  parseProcessTable,
  selectForegroundProcessTitle,
  titleFromCommand,
} from "./foreground-process-title.js";

describe("foreground process title", () => {
  it("uses the foreground process group leader", () => {
    const processes = parseProcessTable(`
      10 1 10 20 Ss /bin/zsh
      20 10 20 20 S+ /usr/bin/vim
      21 20 20 20 S+ /usr/bin/helper
    `);

    expect(selectForegroundProcessTitle(processes, 10)).toBe("vim");
  });

  it("returns null when the shell owns the foreground process group", () => {
    const processes = parseProcessTable(`
      10 1 10 10 Ss /bin/zsh
      20 10 20 10 S /usr/bin/sleep
    `);

    expect(selectForegroundProcessTitle(processes, 10)).toBeNull();
  });

  it("uses a descendant process group when tpgid is unavailable", () => {
    const processes = parseProcessTable(`
      10 1 10 0 Ss /bin/zsh
      20 10 20 0 S+ /opt/homebrew/bin/pnpm
      21 20 20 0 S+ /usr/local/bin/node
    `);

    expect(selectForegroundProcessTitle(processes, 10)).toBe("pnpm");
  });

  it("normalizes command paths into display titles", () => {
    expect(titleFromCommand("/opt/homebrew/bin/htop")).toBe("htop");
    expect(titleFromCommand("")).toBeNull();
  });
});

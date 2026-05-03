import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import os from "node:os";
import type * as XtermAddonSerialize from "@xterm/addon-serialize";
import type * as XtermHeadless from "@xterm/headless";
import { spawn, type IPty } from "node-pty";
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  DEFAULT_SCROLLBACK,
  DEFAULT_TITLE,
  PROCESS_TITLE_POLL_MS,
  PTY_ENV_DENYLIST,
} from "./constants.js";
import { ensureSpawnHelperExecutable } from "./ensure-spawn-helper-executable.js";
import { generateFriendlyId } from "./friendly-id.js";
import { resolveForegroundProcessTitle } from "./foreground-process-title.js";
import { getDefaultShell } from "./default-shell.js";
import { resolveCwdForPid } from "./cwd-resolver.js";
import { formatWorkingDirectoryTitle } from "./working-directory-title.js";
import type { CreateSessionInput, ServerToClientMessage, SessionMetadata } from "./types.js";

const requireCjs = createRequire(import.meta.url);
const { Terminal: HeadlessTerminalCtor } = requireCjs("@xterm/headless") as typeof XtermHeadless;
const { SerializeAddon: SerializeAddonCtor } = requireCjs(
  "@xterm/addon-serialize",
) as typeof XtermAddonSerialize;

type HeadlessTerminal = XtermHeadless.Terminal;
type SerializeAddon = XtermAddonSerialize.SerializeAddon;

interface SessionEvents {
  output: [data: string];
  title: [title: string];
  exit: [code: number | null];
  dispose: [];
}

export class Session extends EventEmitter<SessionEvents> {
  readonly id: string;
  readonly cwd: string;
  readonly shell: string;
  readonly createdAt: number;

  private readonly pty: IPty;
  private readonly headless: HeadlessTerminal;
  private readonly serialize: SerializeAddon;
  private currentTitle: string;
  private currentCols: number;
  private currentRows: number;
  private exited = false;
  private exitCode: number | null = null;
  private attachmentCount = 0;
  private titlePollTimer: NodeJS.Timeout | null = null;
  private titlePollPending = false;
  private hasResolvedAutomaticTitle = false;

  constructor(input: CreateSessionInput) {
    super();
    ensureSpawnHelperExecutable();
    this.id = generateFriendlyId();
    this.shell = input.shell ?? getDefaultShell();
    this.cwd = input.cwd ?? os.homedir();
    this.currentCols = input.cols ?? DEFAULT_COLS;
    this.currentRows = input.rows ?? DEFAULT_ROWS;
    this.createdAt = Date.now();
    this.currentTitle = formatWorkingDirectoryTitle(this.cwd) || DEFAULT_TITLE;

    this.headless = new HeadlessTerminalCtor({
      cols: this.currentCols,
      rows: this.currentRows,
      scrollback: DEFAULT_SCROLLBACK,
      allowProposedApi: true,
    });
    this.serialize = new SerializeAddonCtor();
    this.headless.loadAddon(this.serialize);

    this.headless.onTitleChange((title) => {
      if (this.hasResolvedAutomaticTitle) return;
      const trimmed = title.trim();
      if (!trimmed || trimmed === this.currentTitle) return;
      this.setTitle(trimmed);
    });

    const env: Record<string, string> = {};
    const denied = new Set(PTY_ENV_DENYLIST);
    for (const [key, value] of Object.entries(process.env)) {
      if (denied.has(key)) continue;
      if (typeof value === "string") env[key] = value;
    }
    if (input.env) {
      for (const [key, value] of Object.entries(input.env)) {
        env[key] = value;
      }
    }
    env.TERM = "xterm-256color";
    env.COLORTERM = "truecolor";

    this.pty = spawn(this.shell, [], {
      name: "xterm-256color",
      cols: this.currentCols,
      rows: this.currentRows,
      cwd: this.cwd,
      env,
    });

    this.pty.onData((data) => {
      this.headless.write(data);
      this.emit("output", data);
    });

    this.headless.onData((response) => {
      if (this.exited) return;
      try {
        this.pty.write(response);
      } catch {
        /* PTY may have died between checks */
      }
    });

    this.pty.onExit(({ exitCode }) => {
      this.exited = true;
      this.exitCode = exitCode;
      this.stopTitlePolling();
      this.emit("exit", exitCode);
    });

    this.startTitlePolling();
    void this.refreshProcessTitle();
  }

  get pid(): number {
    return this.pty.pid;
  }

  get title(): string {
    return this.currentTitle;
  }

  get cols(): number {
    return this.currentCols;
  }

  get rows(): number {
    return this.currentRows;
  }

  get isExited(): boolean {
    return this.exited;
  }

  get hasAttachments(): boolean {
    return this.attachmentCount > 0;
  }

  attach(): void {
    this.attachmentCount += 1;
  }

  detach(): void {
    if (this.attachmentCount <= 0) return;
    this.attachmentCount -= 1;
  }

  private setTitle(title: string): void {
    if (title === this.currentTitle) return;
    this.currentTitle = title;
    this.emit("title", title);
  }

  private startTitlePolling(): void {
    if (this.titlePollTimer) return;
    this.titlePollTimer = setInterval(() => void this.refreshProcessTitle(), PROCESS_TITLE_POLL_MS);
    this.titlePollTimer.unref();
  }

  private stopTitlePolling(): void {
    if (!this.titlePollTimer) return;
    clearInterval(this.titlePollTimer);
    this.titlePollTimer = null;
  }

  private async refreshProcessTitle(): Promise<void> {
    if (this.exited || this.titlePollPending) return;
    this.titlePollPending = true;
    try {
      const foregroundTitle = await resolveForegroundProcessTitle(this.pid);
      if (foregroundTitle) {
        this.hasResolvedAutomaticTitle = true;
        this.setTitle(foregroundTitle);
        return;
      }
      const cwd = await resolveCwdForPid(this.pid);
      this.hasResolvedAutomaticTitle = true;
      this.setTitle(formatWorkingDirectoryTitle(cwd ?? this.cwd));
    } finally {
      this.titlePollPending = false;
    }
  }

  metadata(): SessionMetadata {
    return {
      id: this.id,
      title: this.currentTitle,
      cwd: this.cwd,
      shell: this.shell,
      pid: this.pid,
      cols: this.currentCols,
      rows: this.currentRows,
      createdAt: this.createdAt,
      exited: this.exited,
      exitCode: this.exitCode,
    };
  }

  write(data: string): void {
    if (this.exited) return;
    this.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    if (this.exited) return;
    if (cols <= 0 || rows <= 0) return;
    if (cols === this.currentCols && rows === this.currentRows) return;
    this.currentCols = cols;
    this.currentRows = rows;
    this.headless.resize(cols, rows);
    try {
      this.pty.resize(cols, rows);
    } catch {
      /* PTY may have died between checks */
    }
  }

  snapshot(): ServerToClientMessage {
    return {
      type: "snapshot",
      data: this.serialize.serialize(),
      cols: this.currentCols,
      rows: this.currentRows,
      title: this.currentTitle,
    };
  }

  kill(signal: NodeJS.Signals = "SIGHUP"): void {
    if (this.exited) return;
    try {
      this.pty.kill(signal);
    } catch {
      /* already gone */
    }
  }

  dispose(): void {
    this.stopTitlePolling();
    this.kill();
    this.headless.dispose();
    this.removeAllListeners();
    this.emit("dispose");
  }
}

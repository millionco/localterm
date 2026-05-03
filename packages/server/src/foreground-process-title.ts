import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { PROCESS_TITLE_RESOLVE_TIMEOUT_MS } from "./constants.js";

const execFileAsync = promisify(execFile);

interface ProcessInfo {
  pid: number;
  parentPid: number;
  processGroupId: number;
  terminalProcessGroupId: number;
  state: string;
  command: string;
}

interface ProcessCandidate {
  process: ProcessInfo;
  depth: number;
}

const parseNumber = (raw: string): number | null => {
  const value = Number(raw);
  if (!Number.isInteger(value)) return null;
  return value;
};

const parsePsLine = (line: string): ProcessInfo | null => {
  const match = line
    .trim()
    .match(/^(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(\S+)\s+(.+)$/);
  if (!match) return null;
  const [, rawPid, rawParentPid, rawProcessGroupId, rawTerminalProcessGroupId, state, command] =
    match;
  const pid = parseNumber(rawPid);
  const parentPid = parseNumber(rawParentPid);
  const processGroupId = parseNumber(rawProcessGroupId);
  const terminalProcessGroupId = parseNumber(rawTerminalProcessGroupId);
  if (
    pid === null ||
    parentPid === null ||
    processGroupId === null ||
    terminalProcessGroupId === null ||
    state === undefined ||
    command === undefined
  ) {
    return null;
  }
  return {
    pid,
    parentPid,
    processGroupId,
    terminalProcessGroupId,
    state,
    command,
  };
};

export const parseProcessTable = (stdout: string): ProcessInfo[] =>
  stdout
    .split("\n")
    .map(parsePsLine)
    .filter((processInfo) => processInfo !== null);

export const titleFromCommand = (command: string): string | null => {
  const trimmed = command.trim();
  if (!trimmed) return null;
  const title = path.basename(trimmed);
  return title || trimmed;
};

const isLiveProcess = (processInfo: ProcessInfo): boolean => !processInfo.state.includes("Z");

const collectProcessCandidates = (
  rootPid: number,
  byParentPid: Map<number, ProcessInfo[]>,
): ProcessCandidate[] => {
  const candidates: ProcessCandidate[] = [];
  const stack: ProcessCandidate[] = (byParentPid.get(rootPid) ?? []).map((processInfo) => ({
    process: processInfo,
    depth: 1,
  }));
  while (stack.length > 0) {
    const candidate = stack.pop();
    if (!candidate) continue;
    candidates.push(candidate);
    const children = byParentPid.get(candidate.process.pid) ?? [];
    for (const child of children) {
      stack.push({ process: child, depth: candidate.depth + 1 });
    }
  }
  return candidates;
};

const compareByDepthThenPid = (left: ProcessCandidate, right: ProcessCandidate): number =>
  left.depth - right.depth || left.process.pid - right.process.pid;

const selectGroupLeader = (candidates: ProcessCandidate[]): ProcessInfo | null => {
  const sorted = candidates.toSorted(compareByDepthThenPid);
  const leader = sorted.find((candidate) => candidate.process.pid === candidate.process.processGroupId);
  return (leader ?? sorted[0])?.process ?? null;
};

export const selectForegroundProcessTitle = (
  processes: ProcessInfo[],
  rootPid: number,
): string | null => {
  const byPid = new Map(processes.map((processInfo) => [processInfo.pid, processInfo]));
  const root = byPid.get(rootPid);
  if (!root || !isLiveProcess(root)) return null;

  const byParentPid = new Map<number, ProcessInfo[]>();
  for (const processInfo of processes) {
    const siblings = byParentPid.get(processInfo.parentPid) ?? [];
    siblings.push(processInfo);
    byParentPid.set(processInfo.parentPid, siblings);
  }

  const descendants = collectProcessCandidates(rootPid, byParentPid).filter((candidate) =>
    isLiveProcess(candidate.process),
  );
  const rootCandidate: ProcessCandidate = { process: root, depth: 0 };
  const candidates = [rootCandidate, ...descendants];

  if (root.terminalProcessGroupId > 0) {
    if (root.terminalProcessGroupId === root.processGroupId) return null;
    const foregroundCandidates = candidates.filter(
      (candidate) => candidate.process.processGroupId === root.terminalProcessGroupId,
    );
    const foregroundProcess = selectGroupLeader(foregroundCandidates);
    if (foregroundProcess) return titleFromCommand(foregroundProcess.command);
  }

  const nonShellGroupCandidates = descendants.filter(
    (candidate) => candidate.process.processGroupId !== root.processGroupId,
  );
  const descendantProcess = selectGroupLeader(nonShellGroupCandidates);
  return descendantProcess ? titleFromCommand(descendantProcess.command) : null;
};

export const resolveForegroundProcessTitle = async (rootPid: number): Promise<string | null> => {
  if (!Number.isFinite(rootPid) || rootPid <= 0) return null;
  if (process.platform === "win32") return null;
  try {
    const { stdout } = await execFileAsync(
      "ps",
      ["-axo", "pid=,ppid=,pgid=,tpgid=,stat=,comm="],
      { timeout: PROCESS_TITLE_RESOLVE_TIMEOUT_MS, windowsHide: true },
    );
    return selectForegroundProcessTitle(parseProcessTable(stdout), rootPid);
  } catch {
    return null;
  }
};

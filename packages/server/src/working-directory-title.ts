import os from "node:os";
import path from "node:path";
import { IDLE_TITLE_MAX_PATH_SEGMENTS, IDLE_TITLE_TRUNCATION_PREFIX } from "./constants.js";

const HOME_PREFIX = "~";
const PATH_SEPARATOR = "/";

export const abbreviateHome = (cwd: string, home = os.homedir()): string => {
  if (!cwd) return cwd;
  const normalizedCwd = path.resolve(cwd);
  const normalizedHome = path.resolve(home);
  if (normalizedCwd === normalizedHome) return HOME_PREFIX;
  if (normalizedCwd.startsWith(`${normalizedHome}${PATH_SEPARATOR}`)) {
    return `${HOME_PREFIX}${normalizedCwd.slice(normalizedHome.length)}`;
  }
  return normalizedCwd;
};

export const formatWorkingDirectoryTitle = (cwd: string, home = os.homedir()): string => {
  const abbreviated = abbreviateHome(cwd, home);
  const segments = abbreviated.split(PATH_SEPARATOR).filter(Boolean);
  if (segments.length <= IDLE_TITLE_MAX_PATH_SEGMENTS) return abbreviated;
  return `${IDLE_TITLE_TRUNCATION_PREFIX}${PATH_SEPARATOR}${segments
    .slice(-IDLE_TITLE_MAX_PATH_SEGMENTS)
    .join(PATH_SEPARATOR)}`;
};

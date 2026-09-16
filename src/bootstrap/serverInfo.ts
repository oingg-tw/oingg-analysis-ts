let startupTimeInMs: number | null = null;

export function setStartupTime(time: number) {
  startupTimeInMs = time;
}

export function getStartupTime(): number | null {
  return startupTimeInMs;
}

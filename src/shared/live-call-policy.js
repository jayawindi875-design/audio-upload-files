export const MAX_LIVE_DELAY_SECONDS = 60;
export const LIVEKIT_ROOM = "device-raspberry-001";
export const RASPBERRY_PI_IDENTITY = "raspberry-001";

export function normalizeLiveDelaySeconds(value) {
  const normalized = String(value ?? "").trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const seconds = Number(normalized);
  return seconds >= 0 && seconds <= MAX_LIVE_DELAY_SECONDS ? seconds : null;
}

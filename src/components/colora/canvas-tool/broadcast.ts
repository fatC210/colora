/**
 * 多窗口同步（同浏览器多标签）：用 BroadcastChannel 在同源标签间广播场景与撤销历史。
 * 零后端；跨设备同步不在本期范围。
 *
 * 协议：
 *  - { kind: "scene", snapshot, origin }：某 tab 改了场景，广播全量快照；其它 tab 直接应用（不走 commit）。
 *  - { kind: "hello", origin }：新 tab 上线，现有 tab 回应自己的当前快照让新 tab 追上。
 *  - origin = 本 tab 随机 id，用于忽略自己的回声。
 *
 * 失败容忍：BroadcastChannel 在某些环境（SSR、旧浏览器）不可用，降级为无操作。
 */
export type ScenePayload = {
  strokes: unknown[];
  groups: unknown[];
  undoStack: unknown[];
  redoStack: unknown[];
};

export type BroadcastMessage =
  { kind: "scene"; snapshot: ScenePayload; origin: string } | { kind: "hello"; origin: string };

const CHANNEL = "colora";

/** 本 tab 唯一 id（模块级，同 tab 内复用）。 */
export const ORIGIN =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;

export function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

export function broadcastScene(channel: BroadcastChannel | null, snapshot: ScenePayload): void {
  if (!channel) return;
  try {
    channel.postMessage({ kind: "scene", snapshot, origin: ORIGIN } satisfies BroadcastMessage);
  } catch {
    /* ignore */
  }
}

export function broadcastHello(channel: BroadcastChannel | null): void {
  if (!channel) return;
  try {
    channel.postMessage({ kind: "hello", origin: ORIGIN } satisfies BroadcastMessage);
  } catch {
    /* ignore */
  }
}

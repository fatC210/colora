export type CompType =
  | "card"
  | "heading"
  | "text"
  | "button"
  | "input"
  | "circle"
  | "divider"
  | "image";

export type Comp = { id: string; type: CompType; color: string; radius: number };
export type Card = { id: string; name: string; bg: string; comps: Comp[] };
export type ColorQueueItem = { hex: string; locked: boolean; reused?: boolean };
export type CardColorSelection = { cardId: string; source: "list" | "custom"; hex: string };

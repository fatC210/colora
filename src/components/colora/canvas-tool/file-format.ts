import {
  fileOpen as _fileOpen,
  fileSave as _fileSave,
  supported as nativeFileSystemSupported,
} from "browser-fs-access";

import type { BrushType, CanvasLayout, OverlapMode, Size, Stroke, StrokeGroup } from "./types";

/**
 * .colora 画布文件格式
 *
 * 参考 Excalidraw 的 .excalidraw 设计：一个带 type/version 的 JSON 文件，
 * 用浏览器原生 File System Access API（browser-fs-access 封装）读写本地，
 * 支持跨设备导入导出。加载时对不可信输入做 restore（补默认/迁移旧字段/校验）。
 */

export const COLORA_MIME = "application/vnd.colora+json";
export const COLORA_EXTENSION = "colora";
const COLORA_TYPE = "colora";
/** 当前文件格式版本；未来字段变更时递增并在 restoreCanvas 做迁移。 */
const COLORA_VERSION = 1;

/** 导出文件里保存的画布数据（可序列化）。 */
export type ColoraFileData = {
  type: typeof COLORA_TYPE;
  version: number;
  source: string;
  size: Size;
  overlapMode: OverlapMode;
  background: { layout: CanvasLayout; color: string };
  strokes: Stroke[];
  groups: StrokeGroup[];
};

/** 从文件读入、尚未 restore 的原始数据（不可信，字段可能缺失/类型错误）。 */
type ImportedColoraData = Partial<ColoraFileData> & {
  type?: unknown;
  version?: unknown;
};

/** 导出来源标识，便于他人在文件里识别这是 Colora 产物。 */
function getExportSource() {
  return "https://colora.app";
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** 校验 data 是否为合法的 .colora 文件结构（只校验顶层骨架，元素细节留给 restore）。 */
function isValidColoraData(data: unknown): data is ImportedColoraData {
  if (!isObject(data)) return false;
  if (data.type !== COLORA_TYPE) return false;
  if (data.version !== undefined && typeof data.version !== "number") return false;
  if (data.strokes !== undefined && !Array.isArray(data.strokes)) return false;
  if (data.groups !== undefined && !Array.isArray(data.groups)) return false;
  if (data.background !== undefined && !isObject(data.background)) return false;
  return true;
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function asHexColor(v: unknown, fallback: string): string {
  if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase();
  return fallback;
}

const DEFAULT_SIZE: Size = { w: 1120, h: 720 };
const DEFAULT_BG: { layout: CanvasLayout; color: string } = {
  layout: "grid",
  color: "#FFFFFF",
};

/** restore 单个 stop：补默认、修脏数据。 */
function restoreStop(
  raw: unknown,
  fallback: { id: string; hex: string; pos: number; alpha: number },
) {
  if (!isObject(raw)) return { ...fallback };
  const pos = isFiniteNum(raw.pos) ? Math.max(0, Math.min(100, raw.pos)) : fallback.pos;
  const alpha = isFiniteNum(raw.alpha) ? Math.max(0, Math.min(100, raw.alpha)) : fallback.alpha;
  return {
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : fallback.id,
    hex: asHexColor(raw.hex, fallback.hex),
    pos,
    alpha,
  };
}

const VALID_SHAPES = [
  "circle",
  "roundedRect",
  "triangle",
  "pentagon",
  "star",
  "heart",
  "wave",
  "curve",
  "spiral",
  "arrow",
];

const VALID_BRUSH_TYPES: BrushType[] = [
  "pen",
  "marker",
  "highlighter",
  "pencil",
  "neon",
  "spray",
  "brush",
];

/** restore 单个 stroke：补默认字段、规整点坐标、规整 paint，抵御旧版本/手改文件。 */
function restoreStroke(raw: unknown, fallback: Stroke): Stroke {
  if (!isObject(raw)) return { ...fallback };
  const rawPoints = Array.isArray(raw.points) ? raw.points : [];
  const points = rawPoints
    .map((p): { x: number; y: number } | null => {
      if (!isObject(p)) return null;
      const x = isFiniteNum(p.x) ? p.x : 0;
      const y = isFiniteNum(p.y) ? p.y : 0;
      return { x, y };
    })
    .filter((p): p is { x: number; y: number } => p !== null && p !== undefined);

  const kind = asString(raw.kind, "brush") as Stroke["kind"];
  const validKind: Stroke["kind"] =
    kind === "line" || kind === "shape" || kind === "brush" ? kind : "brush";
  const shape = VALID_SHAPES.includes(asString(raw.shape, ""))
    ? (raw.shape as Stroke["shape"])
    : undefined;

  const paintRaw = isObject(raw.paint) ? raw.paint : {};
  const mode = paintRaw.mode === "gradient" ? "gradient" : "solid";
  const solid = asHexColor(paintRaw.solid, fallback.paint.solid);
  const space = (
    paintRaw.space === "rgb" || paintRaw.space === "hsl" || paintRaw.space === "lab"
      ? paintRaw.space
      : fallback.paint.space
  ) as Stroke["paint"]["space"];
  const stopsRaw = Array.isArray(paintRaw.stops) ? paintRaw.stops : [];
  const stops = stopsRaw.length
    ? stopsRaw.map((s, i) =>
        restoreStop(s, {
          id: `${fallback.id}-s${i}`,
          hex: fallback.paint.solid,
          pos:
            i === 0
              ? 0
              : i === stopsRaw.length - 1
                ? 100
                : Math.round((i / (stopsRaw.length - 1)) * 100),
          alpha: 100,
        }),
      )
    : fallback.paint.stops;

  // 箭头统一存为两点 [start, end]：旧版本可能存了 5 点折线 [base, tip, w1, tip, w2]，
  // 迁移为首点→第二点（tip）的两点；多余点丢弃。新版本 shapePoints("arrow") 已返回两点。
  const arrowPoints =
    shape === "arrow" && points.length !== 2 && points.length >= 2
      ? [points[0], points[1]]
      : points;

  const roundness: Stroke["roundness"] =
    raw.roundness === "round" ? "round" : raw.roundness === "sharp" ? "sharp" : undefined;
  const strokeStyle: Stroke["strokeStyle"] =
    raw.strokeStyle === "dashed" ? "dashed" : raw.strokeStyle === "dotted" ? "dotted" : undefined;
  const angle: Stroke["angle"] = isFiniteNum(raw.angle) ? (raw.angle as number) : undefined;
  const brushType: BrushType | undefined = VALID_BRUSH_TYPES.includes(
    raw.brushType as BrushType,
  )
    ? (raw.brushType as BrushType)
    : undefined;

  return {
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : fallback.id,
    name: typeof raw.name === "string" ? raw.name : fallback.name,
    kind: validKind,
    ...(shape ? { shape } : {}),
    points: arrowPoints.length ? arrowPoints : fallback.points,
    width:
      isFiniteNum(raw.width) && (raw.width as number) > 0 ? (raw.width as number) : fallback.width,
    paint: { mode, solid, stops, space },
    ...(typeof raw.groupId === "string" ? { groupId: raw.groupId } : {}),
    ...(roundness ? { roundness } : {}),
    ...(strokeStyle ? { strokeStyle } : {}),
    ...(angle ? { angle } : {}),
    ...(brushType ? { brushType } : {}),
  };
}

/** restore 单个 group。 */
function restoreGroup(raw: unknown, fallback: StrokeGroup): StrokeGroup {
  if (!isObject(raw)) return { ...fallback };
  const strokeIds = Array.isArray(raw.strokeIds)
    ? raw.strokeIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : fallback.strokeIds;
  const stopsRaw = Array.isArray(raw.stops) ? raw.stops : [];
  return {
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : fallback.id,
    name: typeof raw.name === "string" ? raw.name : fallback.name,
    strokeIds,
    space: (raw.space === "rgb" || raw.space === "hsl" || raw.space === "lab"
      ? raw.space
      : fallback.space) as StrokeGroup["space"],
    stops: stopsRaw.length
      ? stopsRaw.map((s, i) =>
          restoreStop(s, {
            id: `${fallback.id}-s${i}`,
            hex: "#000000",
            pos: i === 0 ? 0 : 100,
            alpha: 100,
          }),
        )
      : fallback.stops,
  };
}

export type RestoredCanvas = {
  size: Size;
  overlapMode: OverlapMode;
  background: { layout: CanvasLayout; color: string };
  strokes: Stroke[];
  groups: StrokeGroup[];
};

/**
 * 把从文件读入的原始数据 restore 为可用的画布状态。
 * 策略（参考 Excalidraw restoreElements）：对每个字段优先用文件值、其次用默认值；
 * 对点坐标、颜色、百分比做范围夹取与格式校验，抵御旧版本与手改文件。
 * @param currentSize 当前实际画布尺寸，用于把文件坐标按比例映射进来。
 */
export function restoreCanvas(
  data: unknown,
  currentSize: Size,
  fallback: RestoredCanvas,
): RestoredCanvas {
  if (!isValidColoraData(data)) {
    throw new Error("invalid file");
  }
  const size: Size = {
    w:
      isFiniteNum(data.size) &&
      isObject(data.size) &&
      isFiniteNum((data.size as Record<string, unknown>).w) &&
      ((data.size as Record<string, unknown>).w as number) > 0
        ? ((data.size as Record<string, unknown>).w as number)
        : DEFAULT_SIZE.w,
    h:
      isObject(data.size) &&
      isFiniteNum((data.size as Record<string, unknown>).h) &&
      ((data.size as Record<string, unknown>).h as number) > 0
        ? ((data.size as Record<string, unknown>).h as number)
        : DEFAULT_SIZE.h,
  };
  const overlapMode: OverlapMode = data.overlapMode === "cover" ? "cover" : "mix";
  const bgRaw = isObject(data.background)
    ? (data.background as { layout?: unknown; color?: unknown })
    : {};
  const bgLayoutRaw = bgRaw.layout;
  const layout: CanvasLayout =
    bgLayoutRaw === "grid" || bgLayoutRaw === "blank" || bgLayoutRaw === "dots"
      ? bgLayoutRaw
      : DEFAULT_BG.layout;
  const color = asHexColor(bgRaw.color, DEFAULT_BG.color);

  const strokes = Array.isArray(data.strokes)
    ? (data.strokes as unknown[]).map((s, i) =>
        restoreStroke(
          s,
          fallback.strokes[i] ?? {
            id: `loaded-${i}`,
            name: `线条 ${i + 1}`,
            kind: "brush",
            points: [{ x: 0, y: 0 }],
            width: 18,
            paint: { mode: "solid", solid: "#000000", stops: [], space: "rgb" },
          },
        ),
      )
    : fallback.strokes;
  const groups = Array.isArray(data.groups)
    ? (data.groups as unknown[]).map((g, i) =>
        restoreGroup(
          g,
          fallback.groups[i] ?? {
            id: `loaded-group-${i}`,
            name: `组合 ${i + 1}`,
            strokeIds: [],
            stops: [],
            space: "rgb",
          },
        ),
      )
    : fallback.groups;

  // 把文件坐标按比例映射到当前画布（与 initialStrokes 入场缩放同一模式）。
  const sx = currentSize.w > 0 ? currentSize.w / size.w : 1;
  const sy = currentSize.h > 0 ? currentSize.h / size.h : 1;
  const scaledStrokes =
    sx === 1 && sy === 1
      ? strokes
      : strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ x: p.x * sx, y: p.y * sy })) }));

  return { size, overlapMode, background: { layout, color }, strokes: scaledStrokes, groups };
}

/** 把当前画布状态序列化为 .colora 文件 JSON 字符串。 */
export function serializeCanvas(data: Omit<ColoraFileData, "type" | "version" | "source">): string {
  const payload: ColoraFileData = {
    type: COLORA_TYPE,
    version: COLORA_VERSION,
    source: getExportSource(),
    ...data,
  };
  return JSON.stringify(payload, null, 2);
}

export type SaveColoraResult = { fileHandle: FileSystemFileHandle | null };

/**
 * 保存为 .colora 文件。若已有 fileHandle 则直接覆写该文件（原生 FS API），
 * 否则弹出"另存为"选择路径。不支持 FS API 的浏览器降级为下载。
 */
export async function saveColoraFile(
  data: Omit<ColoraFileData, "type" | "version" | "source">,
  name: string,
  fileHandle: FileSystemFileHandle | null,
): Promise<SaveColoraResult> {
  const serialized = serializeCanvas(data);
  const blob = new Blob([serialized], { type: COLORA_MIME });
  const handle = await _fileSave(
    blob,
    {
      fileName: `${name}.${COLORA_EXTENSION}`,
      description: "Colora file",
      extensions: [`.${COLORA_EXTENSION}`],
      mimeTypes: [COLORA_MIME],
    },
    fileHandle,
    false,
  );
  return { fileHandle: handle };
}

/**
 * 打开一个 .colora 文件并返回原始 JSON 文本（交由 restoreCanvas 解析）。
 * 使用原生 FS API 的打开对话框，降级为 <input type=file>。
 */
export async function openColoraFile(): Promise<{
  text: string;
  handle: FileSystemFileHandle | null;
  name: string;
}> {
  const file = await _fileOpen({
    description: "Colora file",
    extensions: [`.${COLORA_EXTENSION}`],
    mimeTypes: [COLORA_MIME],
    multiple: false,
  });
  // browser-fs-access 在不支持 FS API 时返回 File（含 handle: undefined）；支持时返回 File + handle
  const handle = (file as File & { handle?: FileSystemFileHandle | null }).handle ?? null;
  const text = await file.text();
  return { text, handle, name: file.name.replace(/\.[^.]+$/, "") };
}

export { nativeFileSystemSupported };

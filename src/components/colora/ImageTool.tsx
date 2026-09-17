import { useCallback, useEffect, useRef, useState } from "react";
import { Image, ImagePlus, List, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useColora } from "@/lib/colora-store";
import { simulateCB } from "@/lib/color";
import {
  buildSampleCache,
  clamp01,
  initialPointsFromImage,
  newPointId,
  sampleHexAt,
  type SampleCache,
  type SamplePoint,
} from "@/lib/image-sample";
import { useT } from "@/lib/i18n/use-t";
import { cn } from "@/lib/utils";
import { ExportDialog } from "./ExportDialog";
import { ToolLayout } from "./ToolLayout";
import { PointList } from "./image-tool/PointList";

/** 点位数量上限，与滑块 max 一致。 */
const MAX_POINTS = 20;
/** 滑块重铺的防抖时长：拖动滑块会连续触发 onChange，每次都跑一遍完整 K-means 会明显卡顿。 */
const REEXTRACT_DEBOUNCE_MS = 120;
/** 松手后多久内的 click 视为「拖动收尾」而非「新增点位」。 */
const CLICK_AFTER_DRAG_MS = 300;

export function ImageTool() {
  const { setColor, setPalette, cbMode, setImageExport } = useColora();
  const [src, setSrc] = useState<string | null>(null);
  const [count, setCount] = useState(6);
  const [points, setPoints] = useState<SamplePoint[]>([]);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const cacheRef = useRef<SampleCache | null>(null);
  const dragRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const rafRef = useRef(0);
  const reExtractTimerRef = useRef(0);
  const lastDragEndRef = useRef(0);
  const loadedSrcRef = useRef<string | null>(null);
  const t = useT();

  // 拖动期间**不同步**到 store：每帧写 context 会让整个应用重渲染（Sidebar、InfoPanel…）。
  // 松手时 draggingId 变 null，本 effect 重新触发，一次性同步最终点位。
  useEffect(() => {
    if (draggingId) return;
    setImageExport({
      count,
      points: points.map(({ id, x, y, hex, share }) => ({ id, x, y, hex, share })),
      hasImage: Boolean(src),
      src,
      width: dims?.w ?? 0,
      height: dims?.h ?? 0,
    });
  }, [count, points, draggingId, dims, src, setImageExport]);

  const markLoaded = useCallback(
    (img: HTMLImageElement, forSrc: string) => {
      // onLoad 与下面的兜底 effect 都可能触发，用 src 去重
      if (loadedSrcRef.current === forSrc) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        // SVG 没有固有尺寸时会走到这里
        toast.error(t("无法读取图片"));
        return;
      }
      loadedSrcRef.current = forSrc;
      setDims({ w, h });
      cacheRef.current = buildSampleCache(img);
      if (!cacheRef.current) toast.error(t("无法读取图片"));
      setPoints(initialPointsFromImage(img, count));
    },
    [count, t],
  );

  // 缓存的 dataURL 可能在 React 挂上 onLoad 之前就已 complete（此时 onLoad 不再触发），补一次兜底。
  useEffect(() => {
    const img = imgRef.current;
    if (src && img?.complete && img.naturalWidth > 0) markLoaded(img, src);
  }, [src, markLoaded]);

  const onFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      // 换图：先清掉上一张图的状态，等新图 onLoad 时重建
      loadedSrcRef.current = null;
      cacheRef.current = null;
      setDims(null);
      setPoints([]);
      if (url === src) {
        // 重复上传同一张图：setSrc 会被 React bail out，<img> 不重新解码、onLoad 不再触发，
        // 兜底 effect 的依赖也没变 —— 必须在这里直接重建，否则 dims 永远停在 null。
        const img = imgRef.current;
        if (img?.complete && img.naturalWidth > 0) markLoaded(img, url);
      } else {
        setSrc(url);
      }
    };
    reader.readAsDataURL(file);
  };

  const flushDrag = useCallback(() => {
    rafRef.current = 0;
    const info = dragRef.current;
    const cache = cacheRef.current;
    if (!info || !cache) return;
    // rect 在 pointerdown 时缓存；页面滚动/缩放会让它失效，此时重取一次
    // （rAF 节流保证每帧最多一次，不会退化成每次 pointermove 都强制 layout）。
    let rect = rectRef.current;
    if (!rect) {
      rect = imgRef.current?.getBoundingClientRect() ?? null;
      rectRef.current = rect;
    }
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const x = clamp01((info.x - rect.left) / rect.width);
    const y = clamp01((info.y - rect.top) / rect.height);
    const hex = sampleHexAt(cache, x, y);
    // 函数式更新，避免闭包里拿到陈旧的 points
    setPoints((prev) =>
      prev.map((p) => (p.id === info.id ? { ...p, x, y, hex, share: undefined } : p)),
    );
  }, []);

  const scheduleDrag = useCallback(() => {
    if (rafRef.current) return; // 一帧内多次 move 只算一次
    rafRef.current = requestAnimationFrame(flushDrag);
  }, [flushDrag]);

  // 拖动期间页面滚动/缩放会让缓存的 rect 失效，置空以便下次 flush 重取
  useEffect(() => {
    if (!draggingId) return;
    const invalidate = () => {
      rectRef.current = null;
    };
    window.addEventListener("scroll", invalidate, true);
    window.addEventListener("resize", invalidate);
    return () => {
      window.removeEventListener("scroll", invalidate, true);
      window.removeEventListener("resize", invalidate);
    };
  }, [draggingId]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (reExtractTimerRef.current) clearTimeout(reExtractTimerRef.current);
    },
    [],
  );

  const onHandlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation(); // 关键：不冒泡到 stage 的「新增点位」处理
    e.currentTarget.setPointerCapture(e.pointerId);
    // 拖动期间布局不变，rect 缓存一次即可，省掉每帧的强制 layout
    rectRef.current = imgRef.current?.getBoundingClientRect() ?? null;
    dragRef.current = { id, x: e.clientX, y: e.clientY };
    setDraggingId(id);
    // 刻意不在这里采样：按下点不等于手柄中心，立即采样会让点位跳一下并清掉聚类占比
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.buttons !== 1) return;
    const info = dragRef.current;
    if (!info || info.id !== id) return;
    dragRef.current = { id, x: e.clientX, y: e.clientY };
    scheduleDrag();
  };

  /**
   * 结束拖动。pointercancel 也必须走这里 —— 否则 draggingId 卡住会让 store 同步永久失效。
   * 另外先补一次 flush：最后一次 pointermove 可能已排队 rAF，但醒来时 dragRef 已被清空。
   */
  const endDrag = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    flushDrag();
    lastDragEndRef.current = Date.now();
    dragRef.current = null;
    setDraggingId(null);
  }, [flushDrag]);

  const removePoint = useCallback((id: string) => {
    // 删的正是正在拖的点时，手柄会立刻从 DOM 移除、pointer capture 随之释放，
    // 后续 pointerup 派发不到手柄上，endDrag 永不执行 —— 必须在这里一并结束拖动。
    if (dragRef.current?.id === id) {
      dragRef.current = null;
      lastDragEndRef.current = Date.now();
      setDraggingId(null);
    }
    setPoints((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const pickColor = useCallback((hex: string) => setColor(hex), [setColor]);

  // 新增点位用 click 而非 pointerdown：拖动也是 pointerdown，无法区分；
  // 而 click 只在按下/抬起落在同一元素时触发，拖动手柄永远不会产生 stage 上的 click。
  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-point-handle]")) return;
    // 拖动收尾时浏览器仍可能补一个 click（capture 被提前释放时会落在 stage 上），
    // 用时间窗兜住，避免在松手位置凭空多出一个点位。
    if (Date.now() - lastDragEndRef.current < CLICK_AFTER_DRAG_MS) return;
    const img = imgRef.current;
    const cache = cacheRef.current;
    if (!img || !cache) return;
    if (points.length >= MAX_POINTS) {
      toast.warning(t("最多 {n} 个取色点", { n: MAX_POINTS }));
      return;
    }
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    setPoints((prev) => [...prev, { id: newPointId(), x, y, hex: sampleHexAt(cache, x, y) }]);
  };

  const onCountChange = (k: number) => {
    setCount(k);
    // 滑块连续触发 onChange，每次都跑一遍完整 K-means（约 2.5 万像素 + 4M 次距离计算）会卡顿
    if (reExtractTimerRef.current) clearTimeout(reExtractTimerRef.current);
    reExtractTimerRef.current = window.setTimeout(() => {
      const img = imgRef.current;
      if (img?.complete && img.naturalWidth > 0) setPoints(initialPointsFromImage(img, k));
    }, REEXTRACT_DEBOUNCE_MS);
  };

  const onHandleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, point: SamplePoint) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removePoint(point.id);
      return;
    }
    const step = e.shiftKey ? 0.05 : 0.005;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else return;
    e.preventDefault();
    const cache = cacheRef.current;
    const x = clamp01(point.x + dx);
    const y = clamp01(point.y + dy);
    setPoints((prev) =>
      prev.map((q) =>
        q.id === point.id
          ? { ...q, x, y, hex: cache ? sampleHexAt(cache, x, y) : q.hex, share: undefined }
          : q,
      ),
    );
  };

  return (
    <ToolLayout
      title={t("图片取色")}
      rail={[
        {
          id: "source",
          icon: Image,
          title: t("图片与点位"),
          content: (
            <div className="space-y-4">
              <Button variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
                {src ? t("更换图片") : t("选择图片")}
              </Button>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("初始点位数量")}
                  </span>
                  <span className="font-mono text-xs">{count}</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={MAX_POINTS}
                  value={count}
                  onChange={(e) => onCountChange(Number(e.target.value))}
                  className="w-full accent-foreground"
                />
              </div>

              {src && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t("拖动取色点实时取色，点击图片空白处新增点位")}
                </p>
              )}
            </div>
          ),
        },
        {
          id: "actions",
          icon: Save,
          title: t("操作"),
          visible: points.length > 0,
          content: (
            <div className="flex flex-col gap-2">
              <Button
                className="w-full gap-2"
                onClick={() => setPalette(points.slice(0, 10).map((p) => p.hex))}
              >
                <Save className="size-4" /> {t("保存为配色方案")}
              </Button>
              <ExportDialog
                module="image"
                trigger={
                  <Button variant="outline" className="w-full gap-2">
                    <ImagePlus className="size-4" /> {t("导出当前图片")}
                  </Button>
                }
              />
            </div>
          ),
        },
        {
          id: "points",
          icon: List,
          title: t("点位列表"),
          visible: points.length > 0,
          content: (
            <PointList points={points} cbMode={cbMode} onPick={pickColor} onRemove={removePoint} />
          ),
        },
      ]}
    >
      <section
        className="flex h-full flex-col items-center justify-center"
        onPaste={(e) => onFile(e.clipboardData.files?.[0])}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files?.[0]);
        }}
      >
        {src ? (
          <div className="flex justify-center">
            {/* w-fit 让 wrapper 尺寸 == 图片显示尺寸，(clientX - rect.left) / rect.width
                即可得到归一化坐标，无需处理 object-contain 的留白换算。
                裁切层只包住图片，手柄层放在它外面，避免贴边的手柄/删除按钮被切掉。 */}
            <div onClick={onStageClick} className="relative w-fit max-w-full">
              <div className="overflow-hidden rounded-lg ring-1 ring-border">
                <img
                  ref={imgRef}
                  src={src}
                  alt={t("用于取色的图片")}
                  draggable={false}
                  onLoad={(e) => markLoaded(e.currentTarget, src)}
                  className="block h-auto max-h-[360px] w-auto max-w-full select-none"
                />
              </div>
              {dims && (
                <div className="pointer-events-none absolute inset-0">
                  {points.map((point, index) => (
                    <div
                      key={point.id}
                      className="group absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                    >
                      <button
                        type="button"
                        data-point-handle
                        aria-label={t("取色点 {n}：{hex}", { n: index + 1, hex: point.hex })}
                        onPointerDown={(e) => onHandlePointerDown(e, point.id)}
                        onPointerMove={(e) => onHandlePointerMove(e, point.id)}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onLostPointerCapture={endDrag}
                        onKeyDown={(e) => onHandleKeyDown(e, point)}
                        className={cn(
                          "pointer-events-auto block size-6 touch-none rounded-full border-2 border-white shadow-[0_0_0_1px_var(--color-border),0_6px_18px_rgb(0_0_0/0.30)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
                          draggingId === point.id ? "cursor-grabbing" : "cursor-grab",
                        )}
                        style={{ backgroundColor: simulateCB(point.hex, cbMode) }}
                      />
                      <button
                        type="button"
                        aria-label={t("删除取色点")}
                        onClick={(e) => {
                          e.stopPropagation();
                          removePoint(point.id);
                        }}
                        className="pointer-events-auto absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-background text-foreground opacity-0 shadow ring-1 ring-border transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
                      >
                        <X className="size-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-[280px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <ImagePlus className="size-7" strokeWidth={1.4} />
            <span className="text-sm">{t("拖拽上传 / 点击上传 / 粘贴图片")}</span>
            <span className="text-xs">{t("支持 PNG、JPG、WEBP、SVG")}</span>
          </button>
        )}
      </section>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </ToolLayout>
  );
}

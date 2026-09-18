import type { TKey } from "./i18n";

/**
 * 渐变缓动曲线。
 *
 * 作用：在相邻两个色标之间按曲线分配「取样进度」，从而生成中间色标、把过渡做平滑。
 * CSS 渐变本身只能在色标之间线性插值，色标稀疏时会出现可见色带（banding）——
 * 多生成一批中间色标就能把它抹平，而曲线决定这些色标沿路径怎么分布。
 *
 * 命名与分组对齐 magicpattern 的 CSS Gradient Generator：
 * Linear / IN（in-*）/ OUT（out-*）/ IN-OUT（in-out-*），每档再分 sine / quad / cubic。
 */

export type GradientEasing =
  | "linear"
  | "in-sine"
  | "in-quad"
  | "in-cubic"
  | "out-sine"
  | "out-quad"
  | "out-cubic"
  | "in-out-sine"
  | "in-out-quad"
  | "in-out-cubic";

/**
 * 缓动曲线公式（easings.net 的标准式）。全部满足 f(0)=0、f(1)=1、在 [0,1] 上单调不减 ——
 * 这保证了「渐变两端颜色一定等于用户设的端点色」「过渡不会回头」。
 * 输入会被夹到 [0,1]，浮点误差不会让它跑出值域。
 */
export function ease(kind: GradientEasing, t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  switch (kind) {
    case "linear":
      return x;
    case "in-sine":
      return 1 - Math.cos((x * Math.PI) / 2);
    case "in-quad":
      return x * x;
    case "in-cubic":
      return x * x * x;
    case "out-sine":
      return Math.sin((x * Math.PI) / 2);
    case "out-quad":
      return 1 - (1 - x) * (1 - x);
    case "out-cubic":
      return 1 - Math.pow(1 - x, 3);
    case "in-out-sine":
      return -(Math.cos(Math.PI * x) - 1) / 2;
    case "in-out-quad":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "in-out-cubic":
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
}

/**
 * 画曲线图标用的 SVG path：把 [0,1] 的定义域映射到边长 size 的方框（四周留 pad）。
 * 图标直接由函数本身生成，所以加了新曲线不用再手画图标，也不会和公式走样。
 */
export function easingCurvePath(kind: GradientEasing, size = 20, pad = 3.5): string {
  const inner = size - pad * 2;
  const steps = 16;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = pad + t * inner;
    const y = pad + (1 - ease(kind, t)) * inner;
    if (i > 0) d += " ";
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

/** 下拉里的分组（Linear 单独一组，其余按 IN / OUT / IN-OUT）。label 是 i18n key。 */
export const EASING_GROUPS: readonly { label: TKey; items: readonly GradientEasing[] }[] = [
  { label: "线性", items: ["linear"] },
  { label: "缓入", items: ["in-sine", "in-quad", "in-cubic"] },
  { label: "缓出", items: ["out-sine", "out-quad", "out-cubic"] },
  { label: "缓入缓出", items: ["in-out-sine", "in-out-quad", "in-out-cubic"] },
];

/**
 * 每档缓动的显示名。刻意用网站那套英文写法（Sine / Quad / Cubic）：
 * 中文的「正弦 / 二次 / 三次」是数学术语，和「缓入缓出」拼在一起更难懂（用户反馈看不懂）。
 * 这三个词与 RGB / LAB / LCH / Mesh 一样属于技术标记，所以**不走 i18n**，两种语言下都显示英文。
 */
export const EASING_LABELS: Record<GradientEasing, string> = {
  linear: "Linear",
  "in-sine": "Ease In Sine",
  "in-quad": "Ease In Quad",
  "in-cubic": "Ease In Cubic",
  "out-sine": "Ease Out Sine",
  "out-quad": "Ease Out Quad",
  "out-cubic": "Ease Out Cubic",
  "in-out-sine": "Ease In-Out Sine",
  "in-out-quad": "Ease In-Out Quad",
  "in-out-cubic": "Ease In-Out Cubic",
};

/** 打开缓动开关时默认落到哪条曲线（对齐网站默认值）。 */
export const DEFAULT_EASING: GradientEasing = "in-out-cubic";

/** 判断一个持久化回来的值是不是合法曲线 —— 旧收藏里没有这个字段，或将来改了枚举都要靠它兜底。 */
export function isGradientEasing(value: unknown): value is GradientEasing {
  return typeof value === "string" && value in EASING_LABELS;
}
# Colora

Colora 是一个面向设计师与前端开发者的轻量级色彩工具平台，提供配色方案生成、渐变编辑、色彩混合、图片取色、对比度检查与实时预览能力，帮助你从选色到拿到可用代码快速完成配色工作。

English documentation: [README_en.md](./README_en.md)

## 功能特性

- **配色方案**：基于色彩理论生成配色，支持随机生成、锁定颜色、保存方案与继续编辑。
- **渐变编辑**：可视化编辑线性、径向、锥形与 Mesh 渐变，支持角度、中心点、色标与插值方式调整。
- **色彩混合**：支持减色、加色与平均混合模式，适合快速探索混色结果。
- **图片取色**：支持拖拽、点击上传或粘贴图片，并从 PNG、JPG、WEBP、SVG 中提取主色。
- **对比度检查**：计算前景色与背景色的 WCAG 对比度，并提供同色相替代色建议。
- **实时预览**：将配色应用到卡片、按钮、文本、图片占位等组件中，查看真实界面效果。
- **色盲模拟**：支持红色盲、绿色盲、蓝色盲与全色盲模拟，辅助无障碍设计检查。
- **导出中心**：支持导出或复制 JSON、CSS、SCSS、SVG、PNG 等格式内容。
- **本地收藏**：收藏颜色、配色方案与渐变，数据保存在浏览器本地存储中。
- **响应式界面**：适配桌面端侧边栏与移动端顶部导航。

## 技术栈

- [React 19](https://react.dev/) + TypeScript
- [TanStack Start](https://tanstack.com/start) / [TanStack Router](https://tanstack.com/router)
- [Vite](https://vite.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/) 风格组件 + [Radix UI](https://www.radix-ui.com/)
- [Lucide React](https://lucide.dev/) 图标
- Lovable TanStack/Vite 配置与 Nitro 构建支持

## 快速开始

### 环境要求

- 建议使用 [Bun](https://bun.sh/) 作为包管理器（项目包含 `bun.lock`）。
- Node.js 版本建议与 Vite、React 19、TanStack Start 兼容的现代 LTS 版本。

### 安装依赖

```bash
bun install
```

### 启动开发服务器

```bash
bun run dev
```

开发服务器启动后，根据终端输出访问本地地址，通常为 `http://localhost:5173`。

### 构建生产版本

```bash
bun run build
```

### 本地预览生产构建

```bash
bun run preview
```

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `bun run dev` | 启动 Vite 开发服务器 |
| `bun run build` | 构建生产版本 |
| `bun run build:dev` | 使用 development mode 构建 |
| `bun run preview` | 预览构建产物 |
| `bun run lint` | 运行 ESLint 检查 |
| `bun run format` | 使用 Prettier 格式化项目 |

## 项目结构

```text
.
├── public/                    # 静态资源与站点图标
├── src/
│   ├── components/
│   │   ├── colora/            # Colora 业务组件与工具模块
│   │   └── ui/                # 通用 UI 组件
│   ├── hooks/                 # React Hooks
│   ├── lib/                   # 色彩算法、状态管理、错误处理与工具函数
│   ├── routes/                # TanStack Start 文件路由
│   ├── router.tsx             # Router 创建入口
│   ├── server.ts              # SSR 服务端错误兜底入口
│   ├── start.ts               # TanStack Start 中间件配置
│   └── styles.css             # 全局样式与 Tailwind 样式
├── components.json            # shadcn/ui 配置
├── eslint.config.js           # ESLint 配置
├── package.json               # 项目依赖与脚本
├── tsconfig.json              # TypeScript 配置
└── vite.config.ts             # Vite 与 Lovable/TanStack Start 配置
```

## 核心模块说明

- `src/components/colora/PaletteTool.tsx`：配色方案生成、锁定与收藏。
- `src/components/colora/GradientTool.tsx`：渐变编辑、收藏与 CSS 代码生成。
- `src/components/colora/MixerTool.tsx`：多颜色混合与混合模式切换。
- `src/components/colora/ImageTool.tsx`：图片上传、粘贴与主色提取。
- `src/components/colora/ContrastTool.tsx`：对比度计算、可访问性等级与替代色推荐。
- `src/components/colora/PreviewTool.tsx`：配色在界面组件中的实时预览。
- `src/components/colora/ExportDialog.tsx`：各模块的 JSON、CSS、SVG、PNG 导出。
- `src/lib/color.ts`：颜色转换、色差、插值、色盲模拟、K-means 取色等核心算法。
- `src/lib/colora-store.tsx`：全局状态、收藏数据与导出状态管理。

## 路由约定

项目使用 TanStack Start 文件路由：

- `src/routes/index.tsx` 对应 `/`。
- `src/routes/__root.tsx` 是全局根布局。
- `src/routeTree.gen.ts` 为自动生成文件，不应手动编辑。

更多约定可查看 `src/routes/README.md`。

## 数据与隐私

Colora 当前不依赖后端数据库。收藏颜色、收藏配色方案、收藏渐变与部分 UI 状态保存在浏览器 `localStorage` 中。清除浏览器站点数据会同步清除这些本地收藏。

## 部署说明

项目通过 Lovable 的 TanStack/Vite 配置集成构建能力，并在构建阶段包含 Nitro 支持。常规部署流程为：

```bash
bun install
bun run build
```

随后根据目标平台要求部署生成的构建产物。若在 Lovable 中维护项目，请避免对已发布历史执行强推、变基或修改提交历史。

## 开发提示

- 使用 `@/*` 路径别名引用 `src` 下模块。
- 修改路由文件后，TanStack Router 会重新生成路由树。
- 新增 UI 时优先复用 `src/components/ui` 与 `src/components/colora/primitives.tsx` 中的组件。
- 与颜色相关的算法应优先集中在 `src/lib/color.ts` 中维护。


# Colora

Colora is a lightweight color toolkit for designers and frontend developers. It helps you generate palettes, edit gradients, mix colors, extract colors from images, check contrast, preview UI results, and export production-ready code from a single interface.

中文文档: [README.md](./README.md)

## Features

- **Palette generation**: Generate palettes based on color theory, randomize colors, lock selected swatches, save palettes, and keep editing.
- **Gradient editor**: Visually edit linear, radial, conic, and mesh gradients with controls for angle, center point, stops, and interpolation.
- **Color mixer**: Explore subtractive, additive, and average color mixing modes.
- **Image color extraction**: Drag, upload, or paste images and extract dominant colors from PNG, JPG, WEBP, and SVG files.
- **Contrast checker**: Calculate WCAG contrast for foreground/background pairs and suggest alternative colors with the same hue.
- **Live preview**: Apply palettes to cards, buttons, text, image placeholders, and responsive preview layouts.
- **Color-blind simulation**: Simulate protanopia, deuteranopia, tritanopia, and achromatopsia for accessibility review.
- **Export center**: Export or copy JSON, CSS, SCSS, SVG, and PNG assets from different modules.
- **Local favorites**: Save colors, palettes, and gradients in browser local storage.
- **Responsive UI**: Desktop sidebar navigation and mobile-friendly top navigation.

## Tech Stack

- [React 19](https://react.dev/) + TypeScript
- [TanStack Start](https://tanstack.com/start) / [TanStack Router](https://tanstack.com/router)
- [Vite](https://vite.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)-style components + [Radix UI](https://www.radix-ui.com/)
- [Lucide React](https://lucide.dev/) icons
- Lovable TanStack/Vite configuration with Nitro build support

## Getting Started

### Requirements

- [Bun](https://bun.sh/) is recommended as the package manager because this project includes `bun.lock`.
- Use a modern Node.js LTS version compatible with Vite, React 19, and TanStack Start.

### Install Dependencies

```bash
bun install
```

### Start the Development Server

```bash
bun run dev
```

After the dev server starts, open the local URL printed in the terminal. It is usually `http://localhost:5173`.

### Build for Production

```bash
bun run build
```

### Preview the Production Build

```bash
bun run preview
```

## Available Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the Vite development server |
| `bun run build` | Build the app for production |
| `bun run build:dev` | Build with development mode |
| `bun run preview` | Preview the production build |
| `bun run lint` | Run ESLint checks |
| `bun run format` | Format the project with Prettier |

## Project Structure

```text
.
├── public/                    # Static assets and favicons
├── src/
│   ├── components/
│   │   ├── colora/            # Colora feature modules and business components
│   │   └── ui/                # Shared UI components
│   ├── hooks/                 # React hooks
│   ├── lib/                   # Color algorithms, state, error handling, utilities
│   ├── routes/                # TanStack Start file-based routes
│   ├── router.tsx             # Router creation entry
│   ├── server.ts              # SSR server error fallback entry
│   ├── start.ts               # TanStack Start middleware configuration
│   └── styles.css             # Global styles and Tailwind styles
├── components.json            # shadcn/ui configuration
├── eslint.config.js           # ESLint configuration
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
└── vite.config.ts             # Vite and Lovable/TanStack Start configuration
```

## Core Modules

- `src/components/colora/PaletteTool.tsx`: Palette generation, locking, and favorites.
- `src/components/colora/GradientTool.tsx`: Gradient editing, favorites, and CSS generation.
- `src/components/colora/MixerTool.tsx`: Multi-color mixing and mode switching.
- `src/components/colora/ImageTool.tsx`: Image upload, paste handling, and dominant color extraction.
- `src/components/colora/ContrastTool.tsx`: Contrast calculation, accessibility levels, and alternative color suggestions.
- `src/components/colora/PreviewTool.tsx`: Real-time UI previews using selected palettes.
- `src/components/colora/ExportDialog.tsx`: JSON, CSS, SVG, and PNG export flows.
- `src/lib/color.ts`: Core color conversion, color difference, interpolation, color-blind simulation, and K-means extraction algorithms.
- `src/lib/colora-store.tsx`: Global state, saved favorites, and export state management.

## Routing

This project uses TanStack Start file-based routing:

- `src/routes/index.tsx` maps to `/`.
- `src/routes/__root.tsx` is the global root layout.
- `src/routeTree.gen.ts` is generated automatically and should not be edited by hand.

See `src/routes/README.md` for more route conventions.

## Data and Privacy

Colora currently does not require a backend database. Favorite colors, palettes, gradients, and some UI state are stored in browser `localStorage`. Clearing site data in the browser will remove these local favorites.

## Deployment

The project uses Lovable's TanStack/Vite configuration and includes Nitro support during the build. A typical deployment workflow is:

```bash
bun install
bun run build
```

Then deploy the generated build output according to your hosting platform. If you maintain this project through Lovable, avoid force pushing, rebasing, or amending published Git history.

## Development Notes

- Use the `@/*` path alias for modules under `src`.
- TanStack Router regenerates the route tree after route file changes.
- Prefer reusing components from `src/components/ui` and `src/components/colora/primitives.tsx` when adding UI.
- Keep color-related algorithms centralized in `src/lib/color.ts` when possible.


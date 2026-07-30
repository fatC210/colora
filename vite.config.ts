// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig as defineLovableConfig } from "@lovable.dev/vite-tanstack-config";
import type { ConfigEnv, PluginOption, UserConfig } from "vite";

const config = defineLovableConfig({
  vite: {
    resolve: {
      tsconfigPaths: true,
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});

const removeTsconfigPathsPlugin = (plugins: PluginOption[] = []): PluginOption[] =>
  plugins
    .flatMap((plugin) => (Array.isArray(plugin) ? removeTsconfigPathsPlugin(plugin) : plugin))
    .filter(
      (plugin) => !plugin || typeof plugin !== "object" || plugin.name !== "vite-tsconfig-paths",
    );

export default async (env: ConfigEnv): Promise<UserConfig> => {
  const resolvedConfig = await config(env);

  return {
    ...resolvedConfig,
    resolve: {
      ...resolvedConfig.resolve,
      tsconfigPaths: true,
    },
    plugins: removeTsconfigPathsPlugin(resolvedConfig.plugins),
  };
};

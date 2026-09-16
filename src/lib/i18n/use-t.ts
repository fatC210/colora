import { useCallback } from "react";
import { useColora } from "@/lib/colora-store";
import { translate, type TKey, type TParams } from "./index";

/**
 * 组件内取翻译函数。订阅 store 的 `lang`，切语言时自动重渲染。
 *
 * 单独成文件（而非放进 `./index`）是为了避免循环导入：
 * 这里要 import `colora-store` 拿 `lang`，而 `colora-store` 要 import `TKey`。
 * 隔离开之后 `./index` 保持为纯模块，可以在任何环境（路由 head、非 React 模块）安全引入。
 */
export function useT() {
  const { lang } = useColora();

  return useCallback((key: TKey, params?: TParams) => translate(lang, key, params), [lang]);
}

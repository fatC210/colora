import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    /*
     * 关掉路由级的滚动恢复。
     *
     * 开着的话刷新会跳回上次滚到的位置 —— 但首页是配色墙，每次进来（含刷新）都该
     * 从头看，而且每次进来排列都是重新打乱的，恢复到「第 40 行」本身也没意义。
     * 用户明确要求刷新后留在开头。目前没有哪个工具依赖这个恢复行为。
     */
    scrollRestoration: false,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

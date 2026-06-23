import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "list",
      component: () => import("../pages/MatchList.vue"),
    },
    {
      path: "/match/:mid",
      name: "detail",
      component: () => import("../pages/MatchDetail.vue"),
    },
  ],
});

export default router;

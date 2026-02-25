import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "footprint",
      component: () => import("@/features/footprint/pages/FootprintPage.vue"),
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/features/settings/pages/SettingsPage.vue"),
    },
  ],
});

import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: () => import("../views/Home.vue") },
  { path: "/settings", name: "settings", component: () => import("../views/Settings.vue") },
  { path: "/styles", name: "styles", component: () => import("../views/Styles.vue") },
  { path: "/workspace", name: "workspace", component: () => import("../views/Workspace.vue") },
  { path: "/projects", name: "projects", component: () => import("../views/Projects.vue") },
  { path: "/play", name: "play", component: () => import("../views/Play.vue") },
  { path: "/workflows", name: "workflows", component: () => import("../views/Workflows.vue") },
  { path: "/templates", name: "templates", component: () => import("../views/TemplateEditor.vue") },
  { path: "/assets", name: "assets", component: () => import("../views/Assets.vue") },
  { path: "/:pathMatch(.*)*", redirect: "/" },
  {path: "/webstyles",name: "webstyles",component: () => import("../views/WebStyles.vue"),meta: { title: "Web Styles" }
}

];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

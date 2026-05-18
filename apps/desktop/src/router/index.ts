import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: () => import("../views/WelcomeView.vue"),
    },
    {
      path: "/repositories/:repoId",
      component: () => import("../views/RepoLayout.vue"),
      children: [
        {
          path: "",
          redirect: (to) => `/repositories/${to.params.repoId}/overview`,
        },
        {
          path: "overview",
          name: "overview",
          component: () => import("../views/RepoOverviewView.vue"),
        },
        {
          path: "changes",
          name: "changes",
          component: () => import("../views/ChangesView.vue"),
        },
        {
          path: "history",
          name: "history",
          component: () => import("../views/HistoryView.vue"),
        },
        {
          path: "branches",
          name: "branches",
          component: () => import("../views/BranchesView.vue"),
        },
        {
          path: "stashes",
          name: "stashes",
          component: () => import("../views/StashesView.vue"),
        },
        {
          path: "stash",
          redirect: (to) => `/repositories/${to.params.repoId}/stashes`,
        },
        {
          path: "tags",
          name: "tags",
          component: () => import("../views/TagsView.vue"),
        },
        {
          path: "worktrees",
          name: "worktrees",
          component: () => import("../views/WorktreesView.vue"),
        },
        {
          path: "remotes",
          name: "remotes",
          component: () => import("../views/RemotesView.vue"),
        },
        {
          path: "conflicts",
          name: "conflicts",
          component: () => import("../views/ConflictsView.vue"),
        },
        {
          path: "terminal",
          name: "terminal",
          component: () => import("../views/TerminalView.vue"),
        },
        {
          path: "settings",
          name: "repo-settings",
          component: () => import("../views/RepoSettingsView.vue"),
        },
      ],
    },
    {
      path: "/repo/:repoId",
      redirect: (to) => `/repositories/${to.params.repoId}/overview`,
    },
    {
      path: "/repo/:repoId/:tab",
      redirect: (to) => `/repositories/${to.params.repoId}/${to.params.tab}`,
    },
    {
      path: "/settings",
      component: () => import("../views/SettingsLayout.vue"),
      children: [
        {
          path: "",
          redirect: "/settings/accounts",
        },
        {
          path: "accounts",
          name: "settings-accounts",
          component: () => import("../views/settings/AccountsSettings.vue"),
        },
        {
          path: "git",
          name: "settings-git",
          component: () => import("../views/settings/GitSettings.vue"),
        },
        {
          path: "appearance",
          name: "settings-appearance",
          component: () => import("../views/settings/AppearanceSettings.vue"),
        },
        {
          path: "terminal",
          name: "settings-terminal",
          component: () => import("../views/settings/TerminalSettings.vue"),
        },
      ],
    },
  ],
});

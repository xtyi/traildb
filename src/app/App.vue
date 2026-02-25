<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <div class="app-shell">
      <header class="app-header">
        <div class="brand">
          <p class="brand-kicker">TrailDB</p>
          <h1>旅行足迹</h1>
        </div>
        <nav class="app-nav">
          <RouterLink to="/" class="nav-link" active-class="is-active">足迹地图</RouterLink>
          <RouterLink to="/settings" class="nav-link" active-class="is-active">设置</RouterLink>
        </nav>
      </header>
      <main class="app-content">
        <RouterView />
      </main>
    </div>
  </n-config-provider>
</template>

<script setup lang="ts">
import { NConfigProvider, type GlobalThemeOverrides } from "naive-ui";

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: "#4c9cff",
    primaryColorHover: "#6aacff",
    primaryColorPressed: "#3b8cf0",
    successColor: "#32be95",
    warningColor: "#d8a53e",
    errorColor: "#e86674",
    infoColor: "#649bff",
    borderRadius: "10px",
    borderColor: "rgba(146, 168, 188, 0.35)",
    cardColor: "#ffffff",
    modalColor: "#ffffff",
    bodyColor: "#eef3f8",
    textColorBase: "#243649",
  },
};
</script>

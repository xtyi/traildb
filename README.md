# TrailDB

TrailDB 是一个可静态部署的旅行足迹 WebApp（Vue3 + TypeScript + Vite + ECharts）。

## 功能（v1）

- 中国地图省级/市级切换（按钮直接切换）
- 多颜色标记去过的地区
- 本地持久化（IndexedDB / localStorage）
- 数据导出 / 导入（支持合并或覆盖策略）
- GitHub Pages 自动部署 workflow

## 本地开发

```bash
npm install
npm run geo:generate
npm run dev
```

## 构建

```bash
npm run build
npm run preview
```

## 测试

```bash
npm run test
npm run test:e2e
```

## 目录结构

- `src/app`：启动、路由、全局样式
- `src/features/footprint`：足迹地图核心功能
- `src/features/settings`：导入导出与设置
- `src/services/storage`：存储适配层
- `src/shared`：通用类型和组件
- `public/geo`：静态地图数据与索引
- `scripts/generate-demo-geo.mjs`：GeoJSON 生成脚本

## 说明

当前仓库内置的是可离线运行的示例边界数据（用于保证静态部署和交互链路完整）。
后续可替换 `public/geo` 为更高精度的官方/开源行政区 GeoJSON 数据，不影响业务代码结构。

## 可调配置

- 地图交互配置：`src/app/app-config.json`
- 当前支持：
  - `map.defaultZoom`：地图初始缩放比例
  - `map.labelHideZoomThreshold`：缩小到该比例及以下时，默认隐藏区域名称（hover 仍显示）
  - `map.initialOffsetPercent.x`：地图初始横向偏移（单位：百分比，正数向右）
  - `map.initialOffsetPercent.y`：地图初始纵向偏移（单位：百分比，正数向下，负数向上）
  - `map.colors.regionBorder`：地图区域边框颜色
  - `map.colors.regionBackground`：地图区域背景颜色
  - `map.colors.cityProvinceBoundary`：市级地图中的省级边界颜色


```jsonc
{
  "map": {
    "defaultZoom": 1.30,
    "labelHideZoomThreshold": 1.45,
    "initialOffsetPercent": {
      "x": -5, // 越大地图越靠右
      "y": 13 // 越大地图越靠上
    },
    "colors": {
      "regionBorder": "#93a9bc", // 地图区域边框
      "regionBackground": "#edf3f8", // 地图区域背景
      "cityProvinceBoundary": "#5c7287" // 市级地图叠加的省级边界
    }
  }
}

```

https://www.xoveexu.com/globetrotting.html

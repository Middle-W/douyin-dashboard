# AGENTS.md — 抖音数据看板 · 公司版

> ⚠️ **这是公司版代码仓库**，与个人版（`douyin-dashboard`）区分使用。

## 版本区分

| 项目 | 个人版 | 公司版（本仓库） |
|------|--------|-----------------|
| 路径 | `douyin-dashboard` | `douyin-dashboard-company` |
| 标题 | 抖音账号数据中心 | 抖音数据看板 - 公司版 |
| 用途 | 个人数据查看 | 团队/公司共享数据 |
| 数据 | 可共享或独立 | 可共享或独立 |

## 项目结构

```
douyin-dashboard-company/
├── nextjs-app/           — Next.js 14 + TypeScript 主应用
│   ├── app/              — App Router
│   │   ├── page.tsx      — 看板首页（公司版标题）
│   │   ├── admin/page.tsx — 管理后台（公司版标题）
│   │   └── api/          — API Routes
│   └── ...
├── scripts/              — Playwright 自动化脚本
├── 抖音数据/              — Excel 数据文件
└── setup-new-pc.md       — 新电脑部署文档
```

## 技术栈
- Next.js 14 + React 18 + TypeScript
- Supabase (PostgreSQL)
- Playwright (数据抓取)

## 定时任务
- 抖川余额监控：每30分钟
- 抖老板7天数据导出：每天9:00
- HourlyChain（利润日报）：每小时

## 部署
- 开发：`npm run dev`
- 生产：`npm run build && npm start`
- 服务器部署：见 `setup-new-pc.md`

---
*Updated: 2026-05-17 - 公司版初始化*

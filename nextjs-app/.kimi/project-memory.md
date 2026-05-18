# Kimi Code 项目记忆 — 抖音数据看板

## 技术栈
- Next.js 14.2.0 + TypeScript + Chart.js
- 部署：Vercel (Hobby 计划)
- 数据库：Supabase PostgreSQL，RLS 默认开启
- 脚本：Playwright (chromium)，目录 `../scripts/`
- 日志：`C:\temp\douyin-logs\`

## 已知陷阱（必读）

### 日期格式
- Supabase 返回的日期可能是 `Date` 对象或带 `T00:00:00` 的字符串
- **必须**使用 `normalizeDate()` 统一为 `YYYY-MM-DD`
- 涉及文件：`app/page.tsx`, `app/admin/page.tsx`, `app/api/*`

### 账号匹配规则（截然不同）
| 数据类型 | 匹配逻辑 | 对不上时 |
|---------|---------|---------|
| 订单数据 (`/api/upload`) | 去掉括号后**精确匹配** | 自动创建新账号 |
| 消耗数据 (`/api/upload-cost`) | 精确匹配 → **前缀匹配** | 丢弃，返回 `unmatched` |

### Vercel Hobby 限制
- 边缘网络请求体硬限制：**4.5MB**（不是 30MB）
- Function 超时：60 秒
- 大文件上传必须拆分或迁移自有服务器

### 净佣金
- 订单上传时自动计算：`net_income = income * 0.9`
- 看板利润公式：`profit = net_income - cost`

### Playwright
- 支持 `HEADLESS=true` 环境变量
- 当前在讨论是否增加 `playwright-extra-plugin-stealth` 反检测

### 数据库表
- `accounts`: name UNIQUE, 字段包括 code/account_type/status/buyer/remark/operator
- `daily_stats`: 每日订单聚合，含 net_income
- `daily_costs`: 每日消耗
- `uploads`: 上传记录

## 关键文件路径
```
app/page.tsx              — 看板首页（日历、图表、表格）
app/admin/page.tsx        — 管理后台（账号/字段/数据/上传）
app/api/dashboard/route.ts — 聚合 API
app/api/upload/route.ts    — 订单上传（dryRun 支持）
app/api/upload-cost/route.ts — 消耗上传（dryRun 支持）
app/api/upload-meta/route.ts — 账号基础信息上传
scripts/                  — Playwright 脚本（在 nextjs-app 外）
```

## 架构决策
- 日历可用日期从 `dashboard data` 的 `account.daily` key 中提取，不单独调用 `/api/data-stats`
- 账号排序：空 code fallback 按 name（`ca.localeCompare(cb, 'zh-CN')`）
- 定时任务：Windows 任务计划程序 + VBScript（Hidden=True）

## 运维
- Git 代理：本地端口 `10808`，推送时临时使用
- 新电脑部署：`setup-new-pc.md` + `setup.sql` + `start-local.bat`

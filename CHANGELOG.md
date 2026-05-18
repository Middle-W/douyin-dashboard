# 抖音看板开发记录

> 整理日期：2026-05-11
> 项目地址：https://github.com/Middle-W/douyin-dashboard
> 线上地址：https://douyinsj.site

---

## 一、本次新增功能

### 1. 账号健康度诊断
- 5 维度打分：盈利健康(30%) / 投产健康(25%) / 活跃健康(20%) / 趋势健康(15%) / 消耗稳定(10%)
- 阈值：<50 分进入异常预警
- 表格新增「健康度」列，支持点击排序
- tooltip 向上弹出，白底卡片 + 彩色进度条显示各维度得分

### 2. 智能日报卡片（可折叠）
- 三列布局：
  - 左列：账号类型平均排行（单量 / 净佣金 / 利润）
  - 中列：选品人平均排行（单量 / 净佣金 / 利润）
  - 右列：异常预警 5×2 网格（仅显示正常状态账号）
- 状态持久化到 localStorage

### 3. 健康度筛选
- 「更多筛选」中新增健康度选项：🟢 健康 / 🟡 预警 / 🔴 危险
- 表格按选中等级过滤，统计卡片不受影响

### 4. 顶部统计卡片图标优化
- emoji 改为汉字缩写圆角方块（单 / 佣 / 耗 / 利）
- 任何系统字体下都能正常显示

---

## 二、问题排查记录

### 定时任务失败（2026-05-11）
**现象**：今天 09:00 抖老板 / 09:05 抖川均未推送数据

**根因**：
1. `.bat` 中 `node` / `npm` 是相对命令，任务计划程序 PATH 中找不到（错误码 `2147942402`）
2. `API_URL=http://localhost:3000` 覆盖了脚本默认的完整 API 路径，推到了首页 HTML

**修复**：
- `run-douboss.bat` / `run-douchuan.bat` 中改用绝对路径：
  - `"C:\Program Files\nodejs\node.exe"`
  - `"C:\Program Files\nodejs\npm.cmd"`
- `API_URL` 补全为完整路径：
  - `http://localhost:3000/api/import-daily-stats`
  - `http://localhost:3000/api/import-cost-json`

**手动补跑结果**：
- 抖老板：100 条 → 匹配 100 个账号 ✅
- 抖川：107 条 → 匹配 102 个账号 ✅

---

## 三、域名配置

| 项目 | 内容 |
|---|---|
| 注册域名 | `douyinsj.site` |
| 注册平台 | 腾讯云 |
| 首年费用 | 1 元 |
| 续费费用 | 约 10-20 元/年 |
| Vercel 绑定 | 已绑定，Production 环境 |
| DNS 解析 | A 记录 `@` → `76.76.21.21`；CNAME `www` → `cname.vercel-dns.com` |

**访问地址**：
- 主域名：https://www.douyinsj.site
- 会重定向：douyinsj.site → www.douyinsj.site

---

## 四、已知问题 & 后续规划

| 问题 | 原因 | 解决方案 |
|---|---|---|
| 国内加载较慢（3-5 秒） | Vercel 服务器在美国 | 备案 + 国内 CDN（腾讯云/阿里云）|
| Next.js 14.2.0 安全漏洞警告 | 版本较旧 | 升级至 14.2.15+（非紧急）|

**后续优化优先级**：
1. 如需提速 → 域名备案 + 国内 CDN（年费用 < 100 元）
2. 如需更安全 → 升级 Next.js 补丁版

---

## 五、技术栈

- 前端：Next.js 14.2.0 + TypeScript + Chart.js
- 部署：Vercel
- 数据库：Supabase (PostgreSQL)
- 自动化：Playwright + Windows 任务计划程序
- 定时任务：09:00 抖老板 / 09:05 抖川

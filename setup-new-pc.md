# 新电脑部署指南（本地运行）

> 目标：在另一台 Windows 电脑上快速搭建一套独立的抖音数据看板，抖老板数据走 Excel 上传，消耗数据自动采集，全程静默运行。

---

## 一、准备环境

1. **安装 Node.js 18+ LTS**
   - 下载：https://nodejs.org/（选 LTS 版本）
   - 安装时勾选 **"Add to PATH"**

2. **安装 Google Chrome**（用于自动采集）
   - 下载：https://www.google.cn/chrome/

3. **准备项目文件**
   - 从现有电脑拷贝以下文件夹到新电脑：
     ```
     douyin-dashboard/
     ├── nextjs-app/          ← 前端看板
     ├── scripts/             ← 自动采集脚本
     ├── setup.sql            ← 数据库初始化
     ├── start-local.bat      ← 一键启动脚本
     └── setup-new-pc.md      ← 本文件
     ```

---

## 二、创建数据库（Supabase）

> 看板数据存在云端 Supabase，免费版够用。

1. 打开 https://supabase.com，用邮箱注册/登录
2. 点击 **"New Project"**
3. 填写：
   - Name：`douyin-dashboard-2`（随便取）
   - Database Password：设一个复杂的密码并记住
4. 等待项目创建完成（约 1-2 分钟）
5. 进入项目 → 左侧 **SQL Editor** → **New Query**
6. 把 `setup.sql` 的全部内容粘贴进去 → 点击 **Run**
7. 建表完成后，获取连接信息：
   - 左侧 **Project Settings** → **API**
   - 复制以下 3 个值：
     - `URL` → 对应 `NEXT_PUBLIC_SUPABASE_URL`
     - `anon public` → 对应 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `service_role secret` → 对应 `SUPABASE_SERVICE_ROLE_KEY`

---

## 三、配置环境变量

### 1. 前端配置 (`nextjs-app/.env.local`)

在 `nextjs-app` 文件夹里：
- 把 `.env.example` 复制一份，重命名为 `.env.local`
- 打开 `.env.local`，把 3 个 `YOUR_VALUE_HERE` 替换成 Supabase 里复制的值

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 2. 脚本配置 (`scripts/.env`)

在 `scripts` 文件夹里：
- 把 `.env.example` 复制一份，重命名为 `.env`
- 内容一般不用改，默认就是推送本地 API：

```env
API_URL=http://localhost:3000/api/import-cost-json
HEADLESS=true
```

> 如果需要抓取特定日期，可以加一行 `FETCH_DATE=2026-05-01`

---

## 四、安装依赖 & 启动

**方法一：双击启动（推荐）**

在项目根目录（`douyin-dashboard` 文件夹）里，**双击运行 `start-local.bat`**

脚本会自动：
- 检查 Node.js
- 安装前端依赖（首次）
- 安装脚本依赖（首次）
- 启动前端开发服务器

启动成功后，浏览器访问：**http://localhost:3000**

**方法二：手动命令行**

```powershell
# 1. 安装前端依赖
cd nextjs-app
npm install

# 2. 安装脚本依赖
cd ../scripts
npm install

# 3. 启动前端
cd ../nextjs-app
npm run dev
```

---

## 五、配置自动采集（消耗数据）

### 1. 首次登录（获取 Cookie）

打开 PowerShell，进入 scripts 文件夹：

```powershell
cd C:\路径\到\douyin-dashboard\scripts
npx playwright install chromium
node fetch-douchuan.js
```

- 会弹出一个浏览器窗口，手动登录抖川
- 登录成功后，按 `Ctrl+C` 结束脚本
- Cookie 会自动保存到 `.douchuan-state.json`

### 2. 配置静默定时任务

和现有电脑完全一样，用 **Windows 任务计划程序**：

1. 把以下文件放到 `C:\temp\douyin-scripts\`（手动创建文件夹）：
   - `run-hourly-silent.vbs`
   - `hourly-proxy.bat`
   - `run-hourly-chain.bat`

2. 打开 **任务计划程序** → 创建基本任务：
   - 名称：`Douyin-Hourly`
   - 触发器：每天，每 30 分钟一次
   - 操作：启动程序
   - 程序：`wscript`
   - 参数：`//NoLogo "C:\temp\douyin-scripts\run-hourly-silent.vbs"`
   - 勾选 **"隐藏"**（Hidden = true）

3. 首次运行前，在 `scripts/.env` 里确认 `HEADLESS=true`

> 详细步骤可参考现有电脑上的任务计划配置，或直接复制那 3 个脚本文件过来。

---

## 六、日常使用流程

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 启动看板 | 双击 `start-local.bat`，访问 `localhost:3000` |
| 2 | 上传抖老板订单 | 管理后台 → 📦 上传订单数据 → 选 Excel → 预览确认 → 上传 |
| 3 | 上传消耗数据 | 两种方式：① 管理后台 → 🔥 上传消耗数据 → 选 Excel；② 等定时任务自动采集 |
| 4 | 上传账号信息 | 管理后台 → 📋 上传账号基础信息 → 选 Excel（含名称/类型/状态/选品人/编号等） |
| 5 | 查看数据 | 返回看板首页，选择日期范围查看 |

---

## 七、常见问题

**Q：两台电脑的数据会混在一起吗？**
A：不会。新电脑用的是新的 Supabase 项目，数据完全独立。

**Q：需要一直开着 `start-local.bat` 的黑窗口吗？**
A：是的，前端开发服务器需要一直运行。可以最小化。如果希望开机自启，可以把 `start-local.bat` 放到 Windows 启动文件夹：`Win+R` → `shell:startup` → 粘贴快捷方式。

**Q：抖老板有多个账号，怎么上传？**
A：Excel 里正常包含所有账号的数据即可，上传时会按"抖音号名称"列自动分配到对应账号。

**Q：采集脚本报错？**
A：首次运行必须 `HEADLESS=false`（手动登录），登录成功后再改回 `HEADLESS=true`。

# 世界杯赛事雷达

一个中文足球赛事分析面板，用来展示中国竞彩网公开赛程、实时比分、赛前预测、购买方案、历史方案和命中复盘。

> 说明：本项目只做公开数据整理和本地模型分析，不展示赔率，不保证命中，也不构成投注建议。赛事、竞彩网编号、销售状态和比分来自中国竞彩网公开页面或本地缓存；购买方案和概率为本地模型估算。

## 功能概览

- 赛事总览：今日重点、每日方案汇总、明日预选池。
- 赛事分析：左侧赛事列表独立滚动，右侧分析区固定展示。
- 赛事筛选：支持全部、今日、明日、近 7 天、可购买筛选。
- 单场玩法：胜平负、让球胜平负、具体总进球数、比分、半全场。
- 双候选预测：比分和总进球可保留两个候选，任一命中即算该玩法命中。
- 购买方案：按二串一、三串一、三串二、四串一、四串二分组，每组最多 5 个方案。
- 历史方案：按已完赛和未完赛分栏，再按日期和串单类型归类。
- 命中复盘：按日期归档，可展开查看每个购买方案和每场结果。
- 真实数据刷新：优先请求 Sporttery 接口，接口 403 时会尝试启动本机 Chrome 通过官方页面兜底采集。

## 目录结构

```text
score/
├─ index.html                  # 页面入口
├─ styles.css                  # 页面样式
├─ script.js                   # 前端渲染与交互
├─ data/matches.json           # 当前赛事、方案和复盘数据缓存
├─ assets/football-field-bg.mp4 # 草坪背景视频
├─ scripts/serve-live.js       # 本地实时服务
├─ scripts/update-real-data.js # 数据刷新脚本
└─ tests/dashboard-smoke.test.js
```

## 环境要求

- Node.js 18 或更高版本。
- Windows、macOS、Linux 均可运行。
- 如果 Sporttery 接口返回 403，建议安装 Chrome，用于浏览器兜底采集。
- 项目没有第三方 npm 依赖，克隆后可以直接运行。

## 从 GitHub 克隆

```powershell
git clone https://github.com/zkkkkkkkkk88/score.git
cd score
```

检查 Node 版本：

```powershell
node -v
```

## 本地完整运行

推荐使用实时服务启动：

```powershell
node scripts/serve-live.js
```

启动后访问：

```text
http://127.0.0.1:4173
```

实时服务会做这些事：

- 启动一个本地 HTTP 服务。
- 页面通过 `/api/matches` 读取最新数据。
- 默认每 10 分钟检查一次数据是否需要刷新。
- 数据过期时自动运行 `scripts/update-real-data.js`。
- Sporttery 接口被拦截时，自动尝试 Chrome 浏览器兜底采集。
- 刷新失败时继续展示最近一次成功缓存的数据。

## 手动刷新数据

```powershell
node scripts/update-real-data.js
```

只用现有缓存修复近 7 天历史赛事，不访问 Sporttery：

```powershell
$env:SCORE_REPAIR_HISTORY_ONLY="1"
node scripts/update-real-data.js
```

常用环境变量：

```powershell
$env:PORT="4173"
$env:SPORTTERY_PAGE_SIZE="80"
$env:SCORE_UPDATE_INTERVAL_MS="600000"
$env:SCORE_DATA_MAX_AGE_MS="600000"
$env:SCORE_HISTORY_WINDOW_DAYS="7"
$env:SCORE_BROWSER_FALLBACK="1"
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
node scripts/serve-live.js
```

## 静态访问方式

如果只想查看仓库里已有的 `data/matches.json`，可以用任意静态服务：

```powershell
python -m http.server 4173
```

访问：

```text
http://localhost:4173
```

注意：普通静态服务不会自动刷新真实数据，也不会生成新的购买方案。需要实时刷新时，请使用：

```powershell
node scripts/serve-live.js
```

## 部署方式

### 方式一：个人电脑长期运行

适合自己使用。

1. 克隆仓库。
2. 运行 `node scripts/serve-live.js`。
3. 浏览器打开 `http://127.0.0.1:4173`。
4. 保持终端窗口运行，服务会自动刷新数据。

### 方式二：服务器部署

适合放到云服务器或家用小主机。

```powershell
git clone https://github.com/zkkkkkkkkk88/score.git
cd score
$env:PORT="4173"
node scripts/serve-live.js
```

然后用服务器 IP 访问：

```text
http://服务器IP:4173
```

如果需要公网 HTTPS，可以在外层加 Nginx、Caddy 或其他反向代理，把外部域名转发到本地 `4173` 端口。

### 方式三：GitHub Pages

GitHub Pages 只能托管静态文件。

可以展示页面和仓库里已经保存的 `data/matches.json`，但不能在 GitHub Pages 上运行 Node 脚本，也不能自动访问 Sporttery 刷新数据。

如果要用 GitHub Pages：

1. 在 GitHub 仓库进入 `Settings`。
2. 打开 `Pages`。
3. Source 选择 `Deploy from a branch`。
4. Branch 选择 `main`，目录选择 `/root`。
5. 保存后等待 GitHub 生成访问地址。

要让 GitHub Pages 的数据保持更新，需要在本地或服务器运行刷新脚本，然后把更新后的 `data/matches.json` 提交并推送到 GitHub。

## 定时刷新建议

本地实时服务已经内置自动刷新。如果你想让仓库里的数据文件也定时更新，可以在自己的电脑或服务器上设置定时任务：

```powershell
node scripts/update-real-data.js
git add data/matches.json
git commit -m "Refresh match data"
git push origin main
```

不建议过于频繁请求 Sporttery，默认 10 分钟一次已经够用。

## 测试

```powershell
node tests/dashboard-smoke.test.js
```

测试会检查：

- 页面基础渲染。
- 赛事筛选和购买方案。
- 历史方案归类。
- 命中复盘展开。
- 近 7 天历史赛事恢复。
- 真实盘口、双比分和双进球候选。
- 临场变量分析不再每场完全相同。

## 数据和复盘规则

- 当前赛事数据写入 `data/matches.json`。
- 每次生成的购买方案会保存到 `planArchive`。
- 完赛后系统会自动判断每个方案和每个单场选择是否正确。
- 比分和总进球支持两个候选，只要命中任一候选即算该玩法命中。
- 历史命中率只统计项目实际保存过的购买方案，不补造接入前的历史结果。
- 未完赛场次保持待复盘状态。

## 常见问题

### 为什么终端显示 Sporttery 403？

中国竞彩网接口可能会拦截直接脚本请求。项目会自动尝试浏览器兜底采集。如果 Chrome 路径不是默认位置，请设置：

```powershell
$env:CHROME_PATH="你的 Chrome 路径"
node scripts/update-real-data.js
```

### 为什么 GitHub Pages 不自动刷新？

GitHub Pages 是静态托管，不能运行 `node scripts/serve-live.js`。自动刷新需要在本地电脑、服务器或其他定时环境中运行 Node 脚本。

### 为什么预测会变化？

刷新数据时会重新读取销售状态、比分、可用玩法、历史命中权重和模型信号，因此未完赛场次的方案可能随数据变化而调整。

### 为什么有些比赛没有胜平负？

页面只展示 Sporttery 当前开放或历史归档确认的玩法。有些比赛只有让球胜平负，没有普通胜平负，系统会按真实玩法展示。

## 免责声明

本项目仅用于学习、数据展示和个人分析。请理性看待预测结果，不要把页面中的概率、购买方案或复盘结果作为确定性结论。

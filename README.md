# 体彩足球赛事雷达

一个静态足球赛事分析面板，用于展示中国竞彩网近几天竞猜赛程、竞彩编号、单场预测、每日购买方案、实时数据刷新、命中追踪和明日预选池。

当前版本的赛程、竞彩编号、销售状态和比分来自中国竞彩网公开接口。页面中的购买方向是本地模型估算，不代表确定结果，也不是投注保证。

## 功能模块

- 近两日赛程看板
- 总览、赛事分析、购买方案、命中复盘四个页面视图，支持 `#overview`、`#analysis`、`#plans`、`#review` 直达
- 赛事分析默认筛选可购买场次，也可切换查看全部赛事
- 今日重点赛事快速入口
- 单场胜平负、让球胜平负、具体总进球数、比分、半全场分析
- 单场临场信号，包含趋势变化、风险温度和建议动作
- 每日购买方案中心，默认生成明日串单，覆盖胜平负、让球胜平负、总进球数和比分，并按组合概率排序
- 历史购买方案档案，从项目实际生成的每日方案快照计算命中结果
- 今日命中追踪与近 30 日玩法表现
- 比分完场后自动复盘购买方案命中率
- 从今天开始累计每日购买方案汇总和每日命中率
- 明日预选池，包含准备指数和建议动作

## 本地运行

推荐用实时服务启动，它会定时刷新中国竞彩网数据，并让前端每分钟重取最新 `matches.json`：

```powershell
node scripts/serve-live.js
```

然后访问：

```text
http://127.0.0.1:4173
```

如果只想看静态页面，也可以在项目目录启动普通静态服务：

```powershell
python -m http.server 4173
```

然后访问：

```text
http://localhost:4173
```

普通静态服务不会自动更新 `data/matches.json`，需要手动运行数据更新脚本。

## 更新真实数据

当前项目用 `scripts/update-real-data.js` 从中国竞彩网足球数据接口拉取竞猜赛程和比分，并写入 `data/matches.json`：

```powershell
node scripts/update-real-data.js
```

可选环境变量：

```powershell
$env:SPORTTERY_PAGE_SIZE="80"
node scripts/update-real-data.js
```

实时服务可选环境变量：

```powershell
$env:SCORE_UPDATE_INTERVAL_MS="60000"
$env:PORT="4173"
node scripts/serve-live.js
```

说明：页面不展示回报倍率或盘口价格。当前购买方向和概率是基于中国竞彩网赛程、销售状态和比分生成的本地模型估算，不代表确定结果。

历史命中率只统计项目实际保存到 `planArchive` 的购买方案。首次接入前没有被系统保存过的方案不会伪造历史结果；串单中先完赛的单场会先标注“正确”或“错误”，未完赛场次保持“待赛果”。

## 视觉素材

- 背景视频来自 Pixabay：Football / grass / sport area / ball，1920×1080 MP4。
- Pixabay 内容按其内容许可免费使用，当前项目将视频保存为 `assets/football-field-bg.mp4` 作为本地静态资源。

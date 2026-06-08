# 体彩足球赛事雷达

一个静态足球赛事分析面板，用于展示中国竞彩网近几天竞猜赛程、竞彩编号、单场预测、每日购买方案、实时概率模拟、命中追踪和明日预选池。

当前版本的赛程、竞彩编号、销售状态和比分来自中国竞彩网公开接口。页面中的购买方向是本地模型估算，不代表确定结果，也不是投注保证。

## 功能模块

- 近两日赛程看板
- 今日重点赛事快速入口
- 单场胜平负、总进球数、半全场分析
- 单场临场信号，包含趋势变化、风险温度和建议动作
- 每日购买方案中心，包含命中概率、核心胆、风险点和社会因素研判
- 今日命中追踪与近 30 日玩法表现
- 比分完场后自动复盘购买方案命中率
- 明日预选池，包含准备指数和建议动作

## 本地运行

在项目目录启动静态服务：

```powershell
python -m http.server 4173
```

然后访问：

```text
http://localhost:4173
```

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

说明：页面不展示回报倍率或盘口价格。当前购买方向和概率是基于中国竞彩网赛程、销售状态和比分生成的本地模型估算，不代表确定结果。

## 视觉素材

- 背景视频来自 Pixabay：Football / grass / sport area / ball，1920×1080 MP4。
- Pixabay 内容按其内容许可免费使用，当前项目将视频保存为 `assets/football-field-bg.mp4` 作为本地静态资源。

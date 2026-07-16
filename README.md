# Audio Upload Web

一个部署到 Cloudflare Pages 的极简录音网页。用户通过手机或电脑浏览器录音，可选择立即播放或延迟任意整数秒播放；后端把录音和服务器计算的计划播放时间写入 Cloudflare R2 的 `incoming/` 目录。

## 当前已完成

- 极简网页录音与试听页面
- 立即播放 / 延迟播放二选一
- `1–604800` 秒自定义延迟
- 前后端录音与延迟参数校验
- 上传进度反馈
- Cloudflare Pages Functions 上传接口
- R2 写入逻辑
- Python 消费者骨架，可在电脑先拉取并模拟消费
- Node 原生测试

## 项目结构

- `index.html`: 页面结构
- `styles.css`: 页面样式
- `app.js`: 浏览器录音、播放时间选择与上传交互
- `functions/api/upload.js`: Cloudflare Pages Functions 上传接口
- `src/shared/upload-policy.js`: 前后端共享上传规则
- `src/shared/browser-state.js`: 前端状态与提示文案
- `tests/`: 自动化测试
- `consumer/`: 拉取 R2 音频并本地消费的 Python 代码
- `docs/plans/`: 设计与实施文档

## 你需要完成的配置

### 1. 创建 R2 Bucket

在 Cloudflare Dashboard 中：

1. 打开 `R2`
2. 创建一个 bucket
3. 建议名称：`audio-upload-files`

### 2. 创建 Pages 项目

你有两种方式：

- 方式 A：把当前目录放到 GitHub，然后在 Cloudflare Pages 里连接 Git 仓库
- 方式 B：直接在 Pages 中使用 Direct Upload 上传当前项目文件

建议优先用方式 A，后续更新更方便。

### 3. 绑定 R2 到 Pages Functions

在 Pages 项目设置中添加 R2 绑定：

- Binding name: `AUDIO_UPLOADS`
- Bucket: 选择你刚创建的 `audio-upload-files`

如果这个绑定没配好，接口会返回：

- `STORAGE_NOT_CONFIGURED`

### 4. 获取公开地址

Pages 创建完成后会自动提供一个：

- `https://<your-project>.pages.dev`

这个地址就是给用户访问的公开网页。

## 本地测试

### 运行自动化测试

PowerShell 默认可能拦截 `npm.ps1`，所以用下面这个命令：

```powershell
cmd /c npm.cmd test
```

### 运行消费者测试

```powershell
python -m unittest discover consumer/tests -v
```

### 静态页面预览

如果只想看前端页面样式，可以在当前目录执行：

```powershell
python -m http.server 8080
```

然后打开：

- `http://localhost:8080`

注意：

- 这种方式只能看页面样式与交互
- `/api/upload` 需要在 Cloudflare Pages 环境里才会真正可用

## 线上验证步骤

部署完成后，按下面顺序验证：

1. 打开 `https://<your-project>.pages.dev`
2. 允许浏览器使用麦克风，完成一段录音并试听
3. 选择“立即播放”，或选择“延迟播放”并填写整数秒数
4. 点击“上传录音”，页面应显示 `上传成功`
5. 去 Cloudflare R2 的 `audio-upload-files` bucket 查看
6. 确认对象已写入 `incoming/` 前缀

## 消费者运行方式

当前推荐先在电脑上跑消费者，等树莓派到位后再迁移。

### 1. 安装 Python 依赖

```powershell
python -m pip install -r requirements.txt
```

### 2. 准备环境变量

复制 `.env.example` 为 `.env`，然后填入：

- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

首次联调建议：

- `CONSUMER_DRY_RUN=true`
- `CONSUMER_PLAYER_COMMAND=` 留空

这样消费者会下载并迁移对象，但不会真的播放。

### 3. 先跑一次单次消费

```powershell
python -m consumer.main --once
```

如果成功，会输出类似：

```text
[consumer] status=played key=incoming/1784003102726-2026-07-14-12-13.m4a
```

### 4. 持续轮询

```powershell
python -m consumer.main
```

默认每 10 秒轮询一次 `incoming/`。

## 消费者处理规则

- 从 `incoming/` 读取对象
- 未到计划时间的录音留在云端，不提前下载
- 已到期录音按计划播放时间优先处理
- 旧格式对象无法解析计划时间时按立即播放处理
- 下载到本地 `runtime/incoming/`
- 如果播放或 dry-run 成功：迁移到 `played/`
- 如果播放器返回失败：迁移到 `failed/`
- 如果下载阶段出错：保留在 `incoming/`，下次重试

注意：

- R2 中的“迁移”本质上是 `copy + delete`
- 当前按单消费者设计，适合未来只有一台树莓派或一台电脑在消费

## 未来迁移到树莓派

迁到树莓派时，核心 Python 代码可以保持不变，只需要改三项：

1. `CONSUMER_DOWNLOAD_ROOT`
2. `CONSUMER_PLAYER_COMMAND`
3. 树莓派上的开机自启动方式

推荐的树莓派播放命令可以后续再定，例如使用 `ffplay` 或 `mpg123`。

部署时还要确认：

- 启动树莓派消费者前先停止电脑端消费者；当前按单消费者设计，两端同时运行可能重复播放
- 树莓派已联网并完成系统时间同步，可先用 `timedatectl status` 确认 `System clock synchronized: yes`
- 开机服务应在网络和时间同步完成后启动，否则延迟播放时间可能出现偏差

## 当前录音与延迟规则

- 网页只提供麦克风录音，不再提供本地音频文件选择入口
- 录音格式由浏览器决定，允许：`.m4a`、`.mp4`、`.webm`、`.ogg`，并保留 `.mp3`、`.wav` 接口兼容
- 最大大小：`50 MB`
- 立即播放提交延迟 `0` 秒
- 延迟播放允许 `1–604800` 个整数秒（最多 7 天）
- 计划时间由 Cloudflare 服务器计算，不依赖手机本地时间
- 对象 key 格式：`incoming/<playAt>-<uploadedAt>-<safe-filename>`

## 常见错误

- `NO_FILE`: 没有提交文件
- `UNSUPPORTED_TYPE`: 文件类型不支持
- `FILE_TOO_LARGE`: 文件超过 50 MB
- `INVALID_DELAY`: 延迟秒数不合法
- `STORAGE_NOT_CONFIGURED`: Cloudflare R2 绑定未配置

## 下一阶段

等树莓派拿到手后，只需配置播放器命令和开机自启动；现有消费者已经包含轮询、延迟判断、下载、播放结果归档和失败重试流程。

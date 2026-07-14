# Audio Upload Web

一个部署到 Cloudflare Pages 的极简音频上传网页。用户通过手机浏览器打开网页后，可以上传本地 `mp3`、`m4a`、`wav` 文件，后端会把文件写入 Cloudflare R2 的 `incoming/` 目录。

## 当前已完成

- 极简上传页面
- 前端文件类型与大小校验
- 上传进度反馈
- Cloudflare Pages Functions 上传接口
- R2 写入逻辑
- Python 消费者骨架，可在电脑先拉取并模拟消费
- Node 原生测试

## 项目结构

- `index.html`: 页面结构
- `styles.css`: 页面样式
- `app.js`: 浏览器上传交互
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
2. 选择一个小于 `50 MB` 的 `mp3` 或 `m4a` 文件
3. 点击上传
4. 页面应显示 `上传成功`
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
- 按最早上传时间优先处理
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

## 当前上传规则

- 允许扩展名：`.mp3`、`.m4a`、`.wav`
- 最大大小：`50 MB`
- 对象 key 格式：`incoming/<timestamp>-<safe-filename>`

## 常见错误

- `NO_FILE`: 没有提交文件
- `UNSUPPORTED_TYPE`: 文件类型不支持
- `FILE_TOO_LARGE`: 文件超过 50 MB
- `STORAGE_NOT_CONFIGURED`: Cloudflare R2 绑定未配置

## 下一阶段

等树莓派拿到手后，下一步就是补：

- 轮询 `incoming/` 的拉取脚本
- 下载成功后的本地缓存目录
- 蓝牙音箱播放
- 播放完成后的归档或重命名策略

# Audio Upload Web Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建一个可部署到 Cloudflare Pages 的极简音频上传网站，并把音频文件写入 Cloudflare R2。

**Architecture:** 采用原生静态前端加 Cloudflare Pages Functions。前端负责选择文件、展示进度与提示，后端负责类型/大小校验、文件名规范化和写入 R2，避免引入额外框架与服务器。

**Tech Stack:** HTML, CSS, Browser JavaScript, Cloudflare Pages Functions, Cloudflare R2, Node.js test runner

---

### Task 1: 搭建项目骨架

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `styles.css`
- Create: `app.js`
- Create: `functions/api/upload.js`
- Create: `src/shared/upload-policy.js`
- Create: `tests/upload-policy.test.js`

**Step 1: Write the failing test**

验证允许扩展名、文件大小限制和安全文件名处理。

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because shared policy module does not exist yet

**Step 3: Write minimal implementation**

创建 `src/shared/upload-policy.js`，导出：

- `isAllowedAudioFile()`
- `isAllowedFileSize()`
- `buildObjectKey()`

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for `tests/upload-policy.test.js`

**Step 5: Commit**

```bash
git add package.json index.html styles.css app.js functions/api/upload.js src/shared/upload-policy.js tests/upload-policy.test.js
git commit -m "feat: scaffold audio upload web app"
```

### Task 2: 实现上传接口

**Files:**
- Modify: `functions/api/upload.js`
- Test: `tests/upload-handler.test.js`

**Step 1: Write the failing test**

验证接口会拒绝非法类型/超大文件，并接受合法音频。

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because upload handler behavior is incomplete

**Step 3: Write minimal implementation**

实现 `onRequestPost(context)`：

- 从 `formData()` 读取 `file`
- 校验类型与大小
- 生成对象 key
- 写入 `context.env.AUDIO_UPLOADS`
- 返回 JSON 成功结果

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for `tests/upload-handler.test.js`

**Step 5: Commit**

```bash
git add functions/api/upload.js tests/upload-handler.test.js
git commit -m "feat: add audio upload endpoint"
```

### Task 3: 实现上传页面交互

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Test: `tests/browser-state.test.js`

**Step 1: Write the failing test**

验证前端校验与状态文案映射逻辑。

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because browser state helpers do not exist yet

**Step 3: Write minimal implementation**

实现：

- 文件信息展示
- 上传按钮状态切换
- 前端校验
- 成功/失败提示

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for `tests/browser-state.test.js`

**Step 5: Commit**

```bash
git add index.html styles.css app.js tests/browser-state.test.js
git commit -m "feat: add upload page interactions"
```

### Task 4: 补齐部署说明

**Files:**
- Create: `README.md`

**Step 1: Write the failing test**

此任务为文档任务，不适用自动化测试。

**Step 2: Run test to verify it fails**

跳过。

**Step 3: Write minimal implementation**

写明：

- Cloudflare Pages 创建方式
- R2 Bucket 创建方式
- 环境变量与绑定名
- 本地与线上验证步骤
- 你需要完成的控制台配置项

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: Existing tests remain PASS

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add deployment guide for audio upload web"
```

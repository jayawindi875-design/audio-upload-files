import argparse
import subprocess

from aiohttp import web


DEFAULT_PLAYER_COMMAND = (
    "ffplay -nodisp -autoexit -loglevel warning "
    "-fflags nobuffer -flags low_delay -probesize 32 -analyzeduration 0 -i pipe:0"
)
PLAYER_FACTORY_KEY = web.AppKey("player_factory", object)


PAGE_HTML = """<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pi Live Audio</title>
    <style>
      :root {
        --bg: #eef4f1;
        --text: #101a18;
        --muted: #5f6b67;
        --accent: #087f8c;
        --line: rgba(16, 26, 24, 0.14);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100svh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: var(--bg);
        color: var(--text);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(100%, 680px);
        display: grid;
        gap: 24px;
      }
      h1 {
        margin: 0;
        font-size: clamp(44px, 12vw, 96px);
        line-height: 0.95;
        letter-spacing: 0;
      }
      p { margin: 0; color: var(--muted); line-height: 1.7; }
      .panel {
        display: grid;
        gap: 18px;
        padding: 24px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.78);
      }
      .actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      button {
        min-height: 58px;
        border: 1px solid var(--line);
        border-radius: 999px;
        font: inherit;
        font-size: 18px;
      }
      #start { background: var(--accent); color: white; border-color: var(--accent); }
      button:disabled { opacity: 0.5; }
      .status {
        border-top: 1px solid var(--line);
        padding-top: 16px;
        color: var(--muted);
      }
      @media (max-width: 620px) {
        .actions { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>手机麦克风<br>直连音箱</h1>
      <p>这个页面直接把手机麦克风推送到树莓派播放，不经过 R2 队列。当前固定系统音量播放。</p>
      <section class="panel">
        <div class="actions">
          <button id="start" type="button">开始播放</button>
          <button id="stop" type="button" disabled>停止播放</button>
        </div>
        <div class="status" id="status">准备连接树莓派。</div>
      </section>
    </main>
    <script>
      const startButton = document.getElementById("start");
      const stopButton = document.getElementById("stop");
      const statusEl = document.getElementById("status");
      const MIME_CANDIDATES = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "audio/ogg"
      ];
      let socket = null;
      let stream = null;
      let recorder = null;
      let sentChunks = 0;

      function setStatus(message) {
        statusEl.textContent = message;
      }

      function chooseMimeType() {
        if (!window.MediaRecorder) return "";
        return MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) || "";
      }

      function wsUrl() {
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${location.host}/ws`;
      }

      async function start() {
        const mimeType = chooseMimeType();
        if (!mimeType) {
          setStatus("当前浏览器不支持录音格式。");
          return;
        }

        startButton.disabled = true;
        setStatus("正在打开麦克风...");

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            }
          });
          socket = new WebSocket(wsUrl());
          socket.binaryType = "arraybuffer";
          await new Promise((resolve, reject) => {
            socket.addEventListener("open", resolve, { once: true });
            socket.addEventListener("error", reject, { once: true });
          });

          sentChunks = 0;
          recorder = new MediaRecorder(stream, { mimeType });
          recorder.addEventListener("dataavailable", async (event) => {
            if (event.data && event.data.size > 0 && socket?.readyState === WebSocket.OPEN) {
              socket.send(await event.data.arrayBuffer());
              sentChunks += 1;
              setStatus(`正在播放，已发送 ${sentChunks} 个音频块。`);
            }
          });
          recorder.addEventListener("stop", () => {
            if (socket?.readyState === WebSocket.OPEN) socket.send("stop");
          });
          recorder.start(120);
          stopButton.disabled = false;
          setStatus("正在播放，对着手机说话。");
        } catch (error) {
          stop();
          setStatus("连接失败，请确认麦克风权限和树莓派服务。");
        }
      }

      function stop() {
        if (recorder?.state === "recording") recorder.stop();
        stream?.getTracks().forEach((track) => track.stop());
        if (socket?.readyState === WebSocket.OPEN) socket.close();
        recorder = null;
        stream = null;
        socket = null;
        startButton.disabled = false;
        stopButton.disabled = true;
        setStatus("已停止。");
      }

      startButton.addEventListener("click", start);
      stopButton.addEventListener("click", stop);
      window.addEventListener("beforeunload", stop);
    </script>
  </body>
</html>
"""


class StreamingPlayer:
    def __init__(self, command=DEFAULT_PLAYER_COMMAND, process_factory=subprocess.Popen):
        self.command = command
        self.process_factory = process_factory
        self.process = None

    @property
    def active(self):
        return self.process is not None and self.process.poll() is None

    def start(self):
        if self.active:
            return
        self.process = self.process_factory(
            self.command,
            shell=True,
            stdin=subprocess.PIPE,
        )

    def write(self, data: bytes):
        if not data:
            return
        self.start()
        if self.process and self.process.stdin:
            self.process.stdin.write(data)
            self.process.stdin.flush()

    def stop(self):
        if not self.process:
            return
        if self.process.stdin:
            try:
                self.process.stdin.close()
            except BrokenPipeError:
                pass
        try:
            self.process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            self.process.terminate()
        self.process = None


async def index(_request):
    return web.Response(text=PAGE_HTML, content_type="text/html")


async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    player = request.app[PLAYER_FACTORY_KEY]()
    try:
        async for message in ws:
            if message.type == web.WSMsgType.BINARY:
                player.write(message.data)
            elif message.type == web.WSMsgType.TEXT and message.data == "stop":
                break
    finally:
        player.stop()

    return ws


def create_app(player_command=DEFAULT_PLAYER_COMMAND):
    app = web.Application()
    app[PLAYER_FACTORY_KEY] = lambda: StreamingPlayer(player_command)
    app.router.add_get("/", index)
    app.router.add_get("/ws", websocket_handler)
    return app


def parse_args():
    parser = argparse.ArgumentParser(description="Serve a low-latency browser microphone stream to Pi audio output.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--player-command", default=DEFAULT_PLAYER_COMMAND)
    return parser.parse_args()


def main():
    args = parse_args()
    web.run_app(create_app(args.player_command), host=args.host, port=args.port)


if __name__ == "__main__":
    main()

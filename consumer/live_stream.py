import argparse
import base64
import hashlib
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import socket
import subprocess
import ssl


DEFAULT_PLAYER_COMMAND = (
    "ffplay -nodisp -autoexit -loglevel warning "
    "-fflags nobuffer -flags low_delay -probesize 32 -analyzeduration 0 -i pipe:0"
)

WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

PAGE_HTML = """<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pi Live Audio</title>
    <style>
      :root { --bg:#eef4f1; --text:#101a18; --muted:#5f6b67; --accent:#087f8c; --line:rgba(16,26,24,.14); }
      * { box-sizing: border-box; }
      body { margin:0; min-height:100svh; display:grid; place-items:center; padding:24px; background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      main { width:min(100%,680px); display:grid; gap:24px; }
      h1 { margin:0; font-size:clamp(44px,12vw,96px); line-height:.95; letter-spacing:0; }
      p { margin:0; color:var(--muted); line-height:1.7; }
      .panel { display:grid; gap:18px; padding:24px; border:1px solid var(--line); background:rgba(255,255,255,.78); }
      .actions { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      button { min-height:58px; border:1px solid var(--line); border-radius:999px; font:inherit; font-size:18px; }
      #start { background:var(--accent); color:white; border-color:var(--accent); }
      button:disabled { opacity:.5; }
      .status { border-top:1px solid var(--line); padding-top:16px; color:var(--muted); }
      @media (max-width:620px) { .actions { grid-template-columns:1fr; } }
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
      const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
      let socket = null;
      let stream = null;
      let recorder = null;
      let sentChunks = 0;
      function setStatus(message) { statusEl.textContent = message; }
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
        if (!mimeType) { setStatus("当前浏览器不支持录音格式。"); return; }
        startButton.disabled = true;
        setStatus("正在打开麦克风...");
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false } });
          socket = new WebSocket(wsUrl());
          socket.binaryType = "arraybuffer";
          await new Promise((resolve, reject) => {
            socket.addEventListener("open", resolve, { once:true });
            socket.addEventListener("error", reject, { once:true });
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
        recorder = null; stream = null; socket = null;
        startButton.disabled = false; stopButton.disabled = true;
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
        self.process = self.process_factory(self.command, shell=True, stdin=subprocess.PIPE)

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


def websocket_accept_key(client_key: str) -> str:
    digest = hashlib.sha1((client_key + WEBSOCKET_GUID).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


def read_exact(sock, size: int) -> bytes:
    chunks = []
    remaining = size
    while remaining > 0:
        chunk = sock.recv(remaining)
        if not chunk:
            raise ConnectionError("socket closed")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def read_ws_frame(sock):
    header = read_exact(sock, 2)
    opcode = header[0] & 0x0F
    masked = bool(header[1] & 0x80)
    length = header[1] & 0x7F
    if length == 126:
        length = int.from_bytes(read_exact(sock, 2), "big")
    elif length == 127:
        length = int.from_bytes(read_exact(sock, 8), "big")
    mask = read_exact(sock, 4) if masked else b""
    payload = read_exact(sock, length) if length else b""
    if masked:
        payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    return opcode, payload


class LiveStreamHandler(BaseHTTPRequestHandler):
    player_command = DEFAULT_PLAYER_COMMAND

    def log_message(self, format, *args):
        print(f"[live] {self.address_string()} {format % args}")

    def do_GET(self):
        if self.path == "/":
            body = PAGE_HTML.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/ws":
            self.handle_websocket()
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def handle_websocket(self):
        client_key = self.headers.get("Sec-WebSocket-Key", "")
        if not client_key:
            self.send_error(HTTPStatus.BAD_REQUEST)
            return

        self.send_response(HTTPStatus.SWITCHING_PROTOCOLS)
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", websocket_accept_key(client_key))
        self.end_headers()

        self.connection.settimeout(None)
        player = StreamingPlayer(self.player_command)
        try:
            while True:
                opcode, payload = read_ws_frame(self.connection)
                if opcode == 0x2:
                    player.write(payload)
                elif opcode == 0x1 and payload.decode("utf-8", errors="ignore") == "stop":
                    break
                elif opcode == 0x8:
                    break
        except (ConnectionError, OSError, socket.timeout):
            pass
        finally:
            player.stop()


def create_handler(player_command=DEFAULT_PLAYER_COMMAND):
    return type(
        "ConfiguredLiveStreamHandler",
        (LiveStreamHandler,),
        {"player_command": player_command},
    )


def run_server(
    host="127.0.0.1",
    port=8787,
    player_command=DEFAULT_PLAYER_COMMAND,
    cert_file=None,
    key_file=None,
):
    server = ThreadingHTTPServer((host, port), create_handler(player_command))
    scheme = "http"
    if cert_file and key_file:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=cert_file, keyfile=key_file)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        scheme = "https"
    print(f"[live] listening on {scheme}://{host}:{port}")
    server.serve_forever()


def parse_args():
    parser = argparse.ArgumentParser(description="Serve a low-latency browser microphone stream to Pi audio output.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--player-command", default=DEFAULT_PLAYER_COMMAND)
    parser.add_argument("--cert-file", default="")
    parser.add_argument("--key-file", default="")
    return parser.parse_args()


def main():
    args = parse_args()
    run_server(
        args.host,
        args.port,
        args.player_command,
        cert_file=args.cert_file or None,
        key_file=args.key_file or None,
    )


if __name__ == "__main__":
    main()

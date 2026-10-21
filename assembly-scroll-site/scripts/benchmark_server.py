#!/usr/bin/env python3
"""Local-only media benchmark server with byte-range responses."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse
import mimetypes
import re

ROOT = Path(__file__).resolve().parents[1]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        name = unquote(urlsplit(self.path).path)
        if name == '/':
            file = ROOT / 'tests/format-benchmark.html'
        else:
            root = ROOT / 'dist/assets' if name.startswith('/original/') else self.server.asset_root
            relative = name.removeprefix('/original/') if name.startswith('/original/') else name.lstrip('/')
            file = (root / relative).resolve()
            if not file.is_relative_to(root.resolve()):
                self.send_error(403)
                return
        if not file.is_file():
            self.send_error(404)
            return
        size = file.stat().st_size
        start, end, status = 0, size - 1, 200
        if 'Range' in self.headers:
            match = re.fullmatch(r'bytes=(\d+)-(\d*)', self.headers['Range'])
            if not match or int(match[1]) >= size:
                self.send_error(416)
                return
            start, end, status = int(match[1]), min(int(match[2]) if match[2] else size - 1, size - 1), 206
        self.send_response(status)
        self.send_header('Content-Type', mimetypes.guess_type(file)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'public, max-age=3600')
        if status == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        try:
            with file.open('rb') as stream:
                stream.seek(start)
                remaining = end - start + 1
                while remaining:
                    data = stream.read(min(65536, remaining))
                    if not data:
                        break
                    self.wfile.write(data)
                    remaining -= len(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, *_):
        pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8767)
    parser.add_argument('--assets', type=Path, default=ROOT / '.cache/format-benchmark')
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.asset_root = args.assets
    print(f'Local format comparison: http://127.0.0.1:{args.port}', flush=True)
    server.serve_forever()

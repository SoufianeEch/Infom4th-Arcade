'use strict';
/* Minimal WebSocket server (RFC 6455) with no dependencies: text messages only.
 *   const { attachWebSocket } = require('./ws.cjs');
 *   attachWebSocket(httpServer, '/ws', conn => { conn.on('message', text => ...); conn.send('hi'); });
 * Limits: messages up to MAX_MESSAGE bytes; binary frames close the connection (1003); unmasked client frames are rejected.
 */
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 4096;

class Connection extends EventEmitter {
  constructor(socket, ip) {
    super();
    this.socket = socket;
    this.ip = ip;
    this.open = true;
    this.buf = Buffer.alloc(0);
    this.fragments = [];
    this.fragSize = 0;
    socket.setNoDelay(true);
    socket.on('data', chunk => this._data(chunk));
    socket.on('close', () => this._closed());
    socket.on('error', () => socket.destroy());
  }

  _data(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    if (this.buf.length > MAX_MESSAGE * 2 + 64) return this.close(1009);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, opcode = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, offset = 2;
      if (!masked) return this.close(1002);                       // clients must mask
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; if (this.buf.readUInt32BE(2) !== 0) return this.close(1009); len = this.buf.readUInt32BE(6); offset = 10; }
      if (len > MAX_MESSAGE) return this.close(1009);
      if (this.buf.length < offset + 4 + len) return;
      const mask = this.buf.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buf.subarray(offset + 4, offset + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(offset + 4 + len);
      if (!this._frame(fin, opcode, payload)) return;
    }
  }

  _frame(fin, opcode, payload) {
    if (opcode === 0x8) { this.close(1000); return false; }
    if (opcode === 0x9) { this._write(0xA, payload); return true; }          // ping -> pong
    if (opcode === 0xA) return true;
    if (opcode === 0x2) { this.close(1003); return false; }                   // binary not supported
    if (opcode !== 0x1 && opcode !== 0x0) { this.close(1002); return false; }
    this.fragSize += payload.length;
    if (this.fragSize > MAX_MESSAGE) { this.close(1009); return false; }
    this.fragments.push(payload);
    if (fin) {
      const text = Buffer.concat(this.fragments).toString('utf8');
      this.fragments = []; this.fragSize = 0;
      this.emit('message', text);
    }
    return this.open;
  }

  _write(opcode, payload) {
    if (!this.open && opcode !== 0x8) return;
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | opcode, n]) : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]) : null;
    if (!head) return;
    try { this.socket.write(Buffer.concat([head, payload])); } catch { /* socket already gone */ }
  }

  send(text) { this._write(0x1, Buffer.from(String(text), 'utf8')); }

  close(code = 1000) {
    if (!this.open) return;
    const p = Buffer.alloc(2); p.writeUInt16BE(code);
    this._write(0x8, p);
    this.open = false;
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 500).unref();
    this.emit('close');
  }

  _closed() { if (this.open) { this.open = false; this.emit('close'); } }
}

function attachWebSocket(server, path, onConnection, { verifyOrigin = true } = {}) {
  const live = new Set();
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://x');
    const key = req.headers['sec-websocket-key'];
    const bad = status => { socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`); };
    if (url.pathname !== path) return bad('404 Not Found');
    if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') return bad('400 Bad Request');
    const origin = req.headers.origin;
    if (verifyOrigin && origin) {                                              // browsers only: block other sites from driving our rooms
      let host = '';
      try { host = new URL(origin).host; } catch { /* ignore */ }
      if (host !== req.headers.host) return bad('403 Forbidden');
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const conn = new Connection(socket, req.socket.remoteAddress);
    live.add(conn);
    conn.on('close', () => live.delete(conn));
    onConnection(conn, req);
  });
  server.on('close', () => { for (const c of live) c.socket.destroy(); live.clear(); });
  return { connections: () => live.size };
}

module.exports = { attachWebSocket, MAX_MESSAGE };

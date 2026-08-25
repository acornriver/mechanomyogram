/**
 * Lightweight Node.js OSC Bridge Server (`scripts/osc-bridge.js`)
 * Listens for WebSocket packets from browser and relays native UDP OSC packets to
 * Max/MSP, TouchDesigner, Ableton Live, Pure Data, SuperCollider, Resolume, etc.
 *
 * Usage:
 *   node scripts/osc-bridge.js
 */

import { createServer } from 'http';
import dgram from 'dgram';
import { WebSocketServer } from 'ws';

const WS_PORT = process.env.WS_PORT || 8080;
const DEFAULT_UDP_HOST = '127.0.0.1';
const DEFAULT_UDP_PORT = 57120;

// Create UDP Socket
const udpSocket = dgram.createSocket('udp4');

// Create HTTP & WebSocket Server
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('XTH-MMG OSC WebSocket Bridge running\n');
});

const wss = new WebSocketServer({ server });

console.log(`\n======================================================`);
console.log(`⚡ XTH-MMG OSC Relay Bridge Started`);
console.log(`📡 WebSocket Listening on: ws://localhost:${WS_PORT}`);
console.log(`🎯 Default UDP Target: udp://${DEFAULT_UDP_HOST}:${DEFAULT_UDP_PORT}`);
console.log(`======================================================\n`);

wss.on('connection', (ws) => {
  console.log(`[WebSocket] Browser client connected.`);

  ws.on('message', (message, isBinary) => {
    // -------------------------------------------------------
    // A. Binary Audio Chunk Relay (WebSocket Audio Streaming)
    // -------------------------------------------------------
    if (isBinary) {
      if (ws.audioRole === 'audio-sender') {
        let receiverCount = 0;
        wss.clients.forEach((client) => {
          if (client !== ws && client.audioRole === 'audio-receiver' && client.readyState === 1) {
            client.send(message);
            receiverCount++;
          }
        });
        const now = Date.now();
        if (!ws.lastLogTime || now - ws.lastLogTime > 3000) {
          ws.lastLogTime = now;
          console.log(`🎵 [Audio Relay] Streaming audio -> ${receiverCount} receiver(s)`);
        }
      }
      return;
    }

    // -------------------------------------------------------
    // B. JSON Control Messages
    // -------------------------------------------------------
    try {
      const data = JSON.parse(message.toString());

      // 1. OSC Packet Relay (Existing)
      if (data.type === 'osc-bundle' && Array.isArray(data.messages)) {
        const targetPort = data.targetPort || DEFAULT_UDP_PORT;
        const targetHost = data.targetHost || DEFAULT_UDP_HOST;

        const now = Date.now();
        if (!ws.lastLogTime || now - ws.lastLogTime > 2000) {
          ws.lastLogTime = now;
          console.log(`📡 [UDP Relay] Streaming OSC packets -> ${targetHost}:${targetPort}`);
        }

        data.messages.forEach((msg) => {
          const oscBuffer = encodeOscMessage(msg.address, msg.args);
          udpSocket.send(oscBuffer, targetPort, targetHost, (err) => {
            if (err) console.error(`[UDP Error] Failed to send to ${targetHost}:${targetPort}:`, err);
          });
        });
      }

      // 2. Audio Streaming Role Registration
      if (data.type === 'audio-join') {
        ws.audioRole = data.role; // 'audio-sender' or 'audio-receiver'
        console.log(`🎵 [Audio Stream] Client registered as: ${data.role}`);

        // Tell new client how many peers of each role are connected
        let senders = 0, receivers = 0;
        wss.clients.forEach((c) => {
          if (c !== ws) {
            if (c.audioRole === 'audio-sender') senders++;
            if (c.audioRole === 'audio-receiver') receivers++;
          }
        });

        ws.send(JSON.stringify({ type: 'audio-status', senders, receivers }));

        // Notify all other clients
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(JSON.stringify({ type: 'audio-peer-joined', role: data.role }));
          }
        });
      }

    } catch (e) {
      console.warn('[Bridge] Packet parse error:', e.message);
    }
  });

  ws.on('close', () => {
    const role = ws.audioRole || 'unknown';
    console.log(`[WebSocket] Client disconnected (role: ${role}).`);
    if (ws.audioRole) {
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'audio-peer-left', role: ws.audioRole }));
        }
      });
    }
  });
});

server.listen(WS_PORT);

/**
 * Encodes OSC Address & Arguments into binary OSC packet buffer (32-bit padded)
 */
function encodeOscMessage(address, args = []) {
  const addressBuf = encodeOscString(address);

  let typeTags = ',';
  const argBuffers = [];

  args.forEach((arg) => {
    if (typeof arg === 'number' && Number.isInteger(arg)) {
      typeTags += 'i';
      const buf = Buffer.alloc(4);
      buf.writeInt32BE(arg, 0);
      argBuffers.push(buf);
    } else if (typeof arg === 'number') {
      typeTags += 'f';
      const buf = Buffer.alloc(4);
      buf.writeFloatBE(arg, 0);
      argBuffers.push(buf);
    } else if (typeof arg === 'string') {
      typeTags += 's';
      argBuffers.push(encodeOscString(arg));
    }
  });

  const typeTagBuf = encodeOscString(typeTags);
  return Buffer.concat([addressBuf, typeTagBuf, ...argBuffers]);
}

/**
 * Encodes string into null-terminated 32-bit aligned OSC string
 */
function encodeOscString(str) {
  const nullTerminatedLen = str.length + 1;
  const paddedLen = Math.ceil(nullTerminatedLen / 4) * 4;
  const buf = Buffer.alloc(paddedLen, 0);
  buf.write(str, 0, 'utf8');
  return buf;
}

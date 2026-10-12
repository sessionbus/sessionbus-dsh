import fs from 'node:fs';
import net from 'node:net';
import { createHash } from 'node:crypto';

const [socket, destination, requestFile, product] = process.argv.slice(2);
fs.writeFileSync(`${destination}.source.sha256`, `${createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex')}  ${new URL(import.meta.url).pathname}\n`);
const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
const state = {};
const save = () => { fs.writeFileSync(`${destination}.tmp`, JSON.stringify(state)); fs.renameSync(`${destination}.tmp`, destination); };
let run;
const server = net.createServer(stream => {
  let buffer = '', ran = false;
  const send = frame => {
    const raw = { jsonrpc: '2.0', ...frame };
    fs.appendFileSync(`${destination}.wire.jsonl`, `${JSON.stringify({ direction: 'sent', time: new Date().toISOString(), frame: raw })}\n`);
    return stream.write(`${JSON.stringify(raw)}\n`);
  };
  run = () => {
    if (!state.open?.result?.session_id || ran) throw new Error('one run only, after successful open');
    ran = true;
    send({ id: 2, method: 'turn.execute', params: { session_id: state.open.result.session_id, run_id: 'w126/1', input: 'W126_INPUT' } });
  };
  stream.on('data', chunk => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf('\n'); if (newline < 0) break;
      const frame = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      fs.appendFileSync(`${destination}.wire.jsonl`, `${JSON.stringify({ direction: 'received', time: new Date().toISOString(), frame })}\n`);
      if (frame.method === 'session.hello') {
        state.hello = { product: frame.params.product, hasToken: Boolean(frame.params.launch_token) }; save();
        if (frame.params.product !== product || !frame.params.launch_token) throw new Error(`expected managed ${product} lane hello; got product ${frame.params.product}, token present ${Boolean(frame.params.launch_token)}`);
        state.version = frame.params.version; save(); send({ id: frame.id, result: {} });
        send({ id: 1, method: 'session.open', params: { name: 'w126-options', groups: [], policy: { persistent: false, auto_close_ms: 0, notify: false }, ...request } });
      } else if (frame.id === 1 && !frame.method) { state.openResponses = (state.openResponses ?? 0) + 1; state.open = frame; save(); }
      else if (frame.method === 'session.list') send({ id: frame.id, result: { sessions: [] } });
      else if (frame.id === 2 && !frame.method) { state.executed = frame; save(); }
      else if (frame.method === 'turn.ready') {
        send({ id: frame.id, result: {} });
        send({ id: 3, method: 'turn.status', params: { session_id: state.open.result.session_id, run_id: 'w126/1' } });
      } else if (frame.id === 3 && !frame.method) { state.terminal = frame; save(); }
    }
  });
});
server.listen(socket);
process.on('SIGUSR1', () => run());
process.on('SIGTERM', () => server.close(() => process.exit(0)));

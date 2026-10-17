const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
class Database {
  data = {}; listeners = []; id = 0;
  ref(p) { return new Ref(this, p); }
  get(p) { return p.split('/').reduce((v, k) => v?.[k], this.data) ?? null; }
  write(p, value) {
    const before = this.listeners.map(l => clone(this.get(l.path)));
    const keys = p.split('/');
    let obj = this.data;
    for (const k of keys.slice(0, -1)) obj = obj[k] ??= {};
    if (value == null) delete obj[keys.at(-1)]; else obj[keys.at(-1)] = clone(value);
    this.listeners.forEach((l, i) => {
      const after = clone(this.get(l.path));
      if (JSON.stringify(before[i]) === JSON.stringify(after)) return;
      if (l.event === 'value') this.deliver(l, l.path.split('/').at(-1), after);
      else {
        const a = before[i] || {}, b = after || {};
        const keys = l.event === 'child_added' ? Object.keys(b).filter(k => !(k in a)) : Object.keys(a).filter(k => !(k in b));
        keys.forEach(k => this.deliver(l, k, l.event === 'child_added' ? b[k] : a[k]));
      }
    });
  }
  deliver(l, key, value) {
    queueMicrotask(() => { if (this.listeners.includes(l)) l.fn({ key, val: () => clone(value) }); });
  }
}
class Ref {
  constructor(db, p) { this.db = db; this.path = p; this.key = p.split('/').at(-1); }
  child(p) { return new Ref(this.db, this.path + '/' + p); }
  push(value) { const ref = this.child('id' + ++this.db.id); return value === undefined ? ref : ref.set(value); }
  async set(value) { this.db.write(this.path, value); }
  async remove() { this.db.write(this.path, null); }
  async once() { const value = clone(this.db.get(this.path)); return { val: () => value }; }
  async transaction(fn) {
    const value = fn(clone(this.db.get(this.path)));
    if (value === undefined) return { committed: false };
    this.db.write(this.path, value); return { committed: true };
  }
  onDisconnect() { return { remove: async () => {}, cancel: async () => {} }; }
  on(event, fn) {
    const l = { path: this.path, event, fn }; this.db.listeners.push(l);
    const value = this.db.get(this.path);
    if (event === 'value') this.db.deliver(l, this.key, value);
    if (event === 'child_added') Object.entries(value || {}).forEach(([k, v]) => this.db.deliver(l, k, v));
    return fn;
  }
  off(event, fn) { this.db.listeners = this.db.listeners.filter(l => !(l.path === this.path && l.event === event && l.fn === fn)); }
}
let pcId = 0;
class Peer {
  constructor() { this.id = ++pcId; this.connectionState = 'new'; this.remoteDescription = null; this.senders = []; this.candidates = []; }
  addTrack(track) { this.senders.push({ track, async replaceTrack(next) { this.track = next; }, getParameters: () => ({ encodings: [{}] }), setParameters: async p => { this.params = p; } }); }
  createDataChannel(label) { return { label, readyState: 'open', sent: [], send(value) { this.sent.push(value); }, close() { this.readyState = 'closed'; } }; }
  getSenders() { return this.senders; }
  async createOffer() { return { type: 'offer', sdp: 'offer-' + this.id }; }
  async createAnswer() { return { type: 'answer', sdp: 'answer-for-' + this.remoteDescription.sdp }; }
  async setLocalDescription(d) {
    this.localDescription = d;
    this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'ice-' + this.id }) } });
    if (d.type === 'answer') this.connected();
  }
  async setRemoteDescription(d) {
    if (this.connectionState === 'closed') throw new Error('closed');
    if (d.type === 'answer') assert.equal(d.sdp, 'answer-for-' + this.localDescription.sdp);
    this.remoteDescription = d;
    if (d.type === 'answer') this.connected();
  }
  connected() { this.connectionState = 'connected'; this.onconnectionstatechange?.(); }
  async addIceCandidate(c) { assert.ok(this.remoteDescription, 'ICE must wait for SDP'); this.candidates.push(c); }
  close() { this.connectionState = 'closed'; }
}
class Stream {
  constructor(tracks = [{ kind: 'video', readyState: 'live', stop() { this.readyState = 'ended'; } }, { kind: 'audio', stop() {} }]) { this.tracks = [...tracks]; }
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
  addTrack(track) { this.tracks.push(track); }
  removeTrack(track) { this.tracks = this.tracks.filter(t => t !== track); }
}
function client(db, role) {
  const elements = new Map();
  const document = { querySelectorAll: () => [], createElement: () => ({style: {}, remove() {}}), getElementById(id) {
    if (!elements.has(id)) elements.set(id, { textContent: '', disabled: false, hidden: true,
      replaceChildren() {}, appendChild() {}, addEventListener() {}, play: async () => {} });
    return elements.get(id);
  } };
  const stream = new Stream();
  const context = vm.createContext({ db, document, RTCPeerConnection: Peer, RTC_CONFIG: {}, ROOM_PATH: 'rooms/main',
    MediaStream: Stream, setTimeout: () => {}, VIDEO_MAX_BITRATE: 450000, navigator: { mediaDevices: { getUserMedia: async () => stream, getDisplayMedia: async () => new Stream() } }, console });
  for (const file of ['reactions.js', 'signaling.js', `${role}/${role}.js`]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public', file), 'utf8'), context);
  }
  return { run: code => vm.runInContext(code, context), elements };
}
async function settle() { for (let i = 0; i < 25; i++) await new Promise(resolve => setImmediate(resolve)); }

test('20 independent receivers, late join, isolated departure, emitter protection and restart', async () => {
  const db = new Database();
  const emitter = client(db, 'emisor');
  const receivers = Array.from({ length: 20 }, () => client(db, 'receptor'));
  receivers.forEach(r => r.run('connect()'));
  await settle();
  assert.match(receivers[0].elements.get('status').textContent, /Esperando/);
  await emitter.run('start()');
  await settle();
  assert.equal(emitter.run('peers.size'), 20);
  assert.equal(emitter.elements.get('viewerCount').textContent, '20 conectados / 20 receptores');
  receivers.forEach(r => {
    assert.equal(r.run('connection.pc.connectionState'), 'connected');
    assert.equal(r.run('connection.pc.candidates.length'), 1);
  });
  assert.equal(new Set(receivers.map(r => r.run('viewerRef.path'))).size, 20);
  assert.equal(emitter.run('[...peers.values()].every(p => p.pc.candidates.length === 1)'), true);
  const secondEmitter = client(db, 'emisor');
  await secondEmitter.run('start()'); await settle();
  assert.match(secondEmitter.elements.get('status').textContent, /Ya hay un emisor/);
  assert.equal(emitter.run('peers.size'), 20);
  await receivers[3].run('disconnect()'); await settle();
  assert.equal(emitter.run('peers.size'), 19);
  receivers[3].run('connect()'); await settle();
  assert.equal(emitter.run('peers.size'), 20);
  await emitter.run('stop()'); await settle();
  assert.equal(emitter.run('peers.size'), 0);
  assert.ok(receivers.every(r => r.run('connection === null')));
  await emitter.run('start()'); await settle();
  assert.equal(emitter.elements.get('viewerCount').textContent, '20 conectados / 20 receptores');
  await Promise.all(receivers.map(r => r.run('disconnect()')));
  await emitter.run('stop()'); await settle();
  assert.equal(db.listeners.length, 0, 'all listeners cleaned');
});

test('ICE arriving before SDP is queued and a closed peer ignores new events', async () => {
  const db = new Database();
  const receiver = client(db, 'receptor');
  receiver.run("globalThis.testPeer = createSignaledPeer(db.ref('test'), 'out', 'in', err => { throw err; })");
  await db.ref('test/in').push({ candidate: 'early' }); await settle();
  assert.equal(receiver.run('testPeer.pc.candidates.length'), 0);
  await receiver.run("testPeer.setRemoteDescription({type: 'offer', sdp: 'test'})");
  assert.equal(receiver.run('testPeer.pc.candidates.length'), 1);
  receiver.run('testPeer.close()');
  await db.ref('test/in').push({ candidate: 'late' }); await settle();
  assert.equal(receiver.run('testPeer.pc.candidates.length'), 1);
  assert.equal(db.listeners.length, 0);
});

test('camera permission failure restores controls and leaves no room', async () => {
  const db = new Database();
  const emitter = client(db, 'emisor');
  emitter.run("navigator.mediaDevices.getUserMedia = async () => { throw new Error('Permiso denegado'); }");
  await emitter.run('start()');
  assert.equal(emitter.elements.get('startBtn').disabled, false);
  assert.equal(emitter.elements.get('stopBtn').disabled, true);
  assert.match(emitter.elements.get('status').textContent, /Permiso denegado/);
  assert.equal(db.get('rooms/main/sessionId'), null);
});

test('blocked autoplay exposes play button; manual retry hides it', async () => {
  const db = new Database();
  const receiver = client(db, 'receptor');
  receiver.elements.get('remoteVideo').play = async () => { throw new Error('Autoplay blocked'); };
  await receiver.run('tryPlay()');
  assert.equal(receiver.elements.get('playBtn').hidden, false);
  receiver.elements.get('remoteVideo').play = async () => {};
  await receiver.run('tryPlay()');
  assert.equal(receiver.elements.get('playBtn').hidden, true);
});

test('screen switching preserves peers and audio, including late join and browser stop', async () => {
  const db = new Database(), emitter = client(db, 'emisor');
  await emitter.run('start()');
  const viewers = Array.from({length: 3}, () => client(db, 'receptor'));
  viewers.forEach(v => v.run('connect()')); await settle();
  emitter.run('globalThis.originalPeers = [...peers.values()]; globalThis.audio = localStream.getTracks().find(t => t.kind === "audio")');
  await emitter.run('shareScreen()');
  assert.equal(emitter.run('[...peers.values()].every(p => p.pc.getSenders().find(s => s.track.kind === "video").track === displayStream.getVideoTracks()[0])'), true);
  const late = client(db, 'receptor'); late.run('connect()'); await settle();
  assert.equal(emitter.run('[...peers.values()].every(p => p.pc.getSenders().find(s => s.track.kind === "video").track === displayStream.getVideoTracks()[0])'), true);
  await emitter.run('displayStream.getVideoTracks()[0].onended()');
  assert.equal(emitter.run('displayStream'), null);
  assert.equal(emitter.run('originalPeers.every(p => [...peers.values()].includes(p))'), true);
  assert.equal(emitter.run('[...peers.values()].every(p => p.pc.getSenders().find(s => s.track.kind === "audio").track === audio)'), true);
  await emitter.run('stop()');
});

test('cancelled picker and capture completing after stop leave no screen capture', async () => {
  const emitter = client(new Database(), 'emisor');
  await emitter.run('start()');
  emitter.run('navigator.mediaDevices.getDisplayMedia = async () => { throw Object.assign(new Error("cancelled"), {name:"NotAllowedError"}); }');
  await emitter.run('shareScreen()');
  assert.equal(emitter.run('localStream.getVideoTracks()[0] === cameraStream.getVideoTracks()[0]'), true);
  emitter.run('navigator.mediaDevices.getDisplayMedia = () => new Promise(resolve => globalThis.resolveCapture = resolve); globalThis.pending = shareScreen()');
  await emitter.run('stop()');
  emitter.run('globalThis.capture = new MediaStream(); resolveCapture(capture)');
  await emitter.run('pending');
  assert.equal(emitter.run('capture.getVideoTracks()[0].readyState'), 'ended');
  assert.equal(emitter.run('localStream'), null);
});

test('reactions are relayed to all viewers and invalid messages are ignored', async () => {
  const db = new Database(), emitter = client(db, 'emisor');
  await emitter.run('start()');
  const viewers = Array.from({length: 3}, () => client(db, 'receptor'));
  viewers.forEach(v => v.run('connect()')); await settle();
  emitter.run('[...peers.values()][0].reactions.onmessage({data:"🔥"})');
  assert.equal(emitter.run('[...peers.values()].every(p => p.reactions.sent.length === 1 && p.reactions.sent[0] === "🔥")'), true);
  emitter.run('broadcastReaction("<script>")');
  assert.equal(emitter.run('[...peers.values()].every(p => p.reactions.sent.length === 1)'), true);
  await emitter.run('stop()');
});

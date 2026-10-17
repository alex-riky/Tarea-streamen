// Una captura compartida y una conexión independiente por espectador.
const localVideo = document.getElementById('localVideo');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const peers = new Map();
let localStream = null, roomRef = null, sessionRef = null, viewersRef = null;
let sessionId = null, running = false;
let addedHandler = null, removedHandler = null;
let cameraStream = null, displayStream = null, switching = false, mediaGeneration = 0;
const screenBtn = document.getElementById('screenBtn');
const cameraBtn = document.getElementById('cameraBtn');
function updateSourceControls() {
  screenBtn.disabled = !localStream || switching || !!displayStream;
  cameraBtn.disabled = !localStream || switching || !displayStream;
  document.getElementById('sourceLabel').textContent = displayStream ? 'VISTA PREVIA · TU PANTALLA' : 'VISTA PREVIA · TU CÁMARA';
}
async function replaceVideo(track) {
  const previous = localStream.getVideoTracks()[0];
  // Incluye espectadores que se conecten mientras se reemplazan las pistas.
  localStream.removeTrack(previous);
  localStream.addTrack(track);
  const results = await Promise.allSettled([...peers.values()].map(async peer => {
    const sender = peer.pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(track);
  }));
  if (results.some(r => r.status === 'rejected')) {
    localStream.removeTrack(track); localStream.addTrack(previous);
    await Promise.allSettled([...peers.entries()].map(async ([id, peer]) => {
      try { await peer.pc.getSenders().find(s => s.track?.kind === 'video')?.replaceTrack(previous); }
      catch { removeViewer(id); }
    }));
    throw new Error('No se pudo cambiar la fuente. Intenta nuevamente.');
  }
  localVideo.srcObject = localStream;
}
async function shareScreen() {
  if (!localStream || switching || displayStream) return;
  if (!navigator.mediaDevices.getDisplayMedia) { setStatus('Este navegador no permite compartir pantalla. Usa Chrome o Edge en HTTPS o localhost.'); return; }
  const token = mediaGeneration;
  switching = true; updateSourceControls();
  let capture;
  try {
    capture = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 20, max: 24 } }, audio: false });
    if (token !== mediaGeneration || !localStream) { capture.getTracks().forEach(t => t.stop()); return; }
    const track = capture.getVideoTracks()[0];
    if (!track || track.readyState === 'ended') throw new Error('La captura de pantalla terminó.');
    await replaceVideo(track);
    if (token !== mediaGeneration) { capture.getTracks().forEach(t => t.stop()); return; }
    displayStream = capture;
    track.onended = () => returnToCamera();
    setStatus('Compartiendo pantalla. Tu micrófono sigue activo.');
  } catch (err) {
    capture?.getTracks().forEach(t => t.stop());
    if (token === mediaGeneration) setStatus(err.name === 'NotAllowedError' ? 'Captura cancelada. Continúas transmitiendo la cámara.' : err.message);
  } finally { switching = false; updateSourceControls(); }
  if (displayStream?.getVideoTracks()[0].readyState === 'ended') await returnToCamera();
}
async function returnToCamera() {
  if (!displayStream || !localStream || switching) return;
  switching = true; updateSourceControls();
  try {
    await replaceVideo(cameraStream.getVideoTracks()[0]);
    displayStream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    displayStream = null;
    setStatus('Transmitiendo cámara. Se detuvo la captura de pantalla.');
  } catch (err) { setStatus(err.message); }
  finally { switching = false; updateSourceControls(); }
}
function broadcastReaction(emoji) {
  if (!running || !REACTION_EMOJIS.includes(emoji)) return;
  showReaction(emoji);
  peers.forEach(peer => {
    if (peer.reactions?.readyState === 'open') {
      try { peer.reactions.send(emoji); } catch (err) { console.warn('Reacción no enviada', err); }
    }
  });
}
const setStatus = text => { statusEl.textContent = text; };
function updateStatusText() {
  const connected = [...peers.values()].filter(p => p.pc.connectionState === 'connected').length;
  document.getElementById('viewerCount').textContent = `${connected} conectados / ${peers.size} receptores`;
  if (localStream) setStatus(`Transmitiendo en vivo. ${connected} espectadores conectados.`);
}
function removeViewer(id) {
  const peer = peers.get(id);
  if (!peer) return;
  peers.delete(id); peer.close(); updateStatusText();
}
async function start() {
  if (running) return;
  running = true; startBtn.disabled = true;
  setStatus('Solicitando acceso a cámara y micrófono...');
  try {
    localStream = await navigator.mediaDevices.getUserMedia({video: {width: 640, height: 360, frameRate: {ideal: 20, max: 24}}, audio: true});
    cameraStream = new MediaStream(localStream.getTracks());
    roomRef = db.ref(ROOM_PATH);
    sessionId = roomRef.child('sessions').push().key;
    // La transacción protege al emisor activo de otra pestaña.
    const claim = await roomRef.child('sessionId').transaction(value => value ? undefined : sessionId);
    if (!claim.committed) throw new Error('Ya hay un emisor transmitiendo. Detén esa transmisión primero.');
    sessionRef = roomRef.child('sessions').child(sessionId);
    await sessionRef.onDisconnect().remove();
    await roomRef.child('sessionId').onDisconnect().remove();
    await sessionRef.child('active').set(true);
    localVideo.srcObject = localStream;
    viewersRef = sessionRef.child('viewers');
    addedHandler = snapshot => handleNewViewer(snapshot.key);
    removedHandler = snapshot => removeViewer(snapshot.key);
    viewersRef.on('child_added', addedHandler);
    viewersRef.on('child_removed', removedHandler);
    stopBtn.disabled = false; updateStatusText(); updateSourceControls(); enableReactions(true);
  } catch (err) { await stop(); setStatus('No se pudo iniciar: ' + err.message); }
}
async function handleNewViewer(id) {
  if (!viewersRef || peers.has(id) || !localStream) return;
  const ref = viewersRef.child(id);
  const peer = createSignaledPeer(ref, 'callerCandidates', 'calleeCandidates', err => setStatus('Error de conexión: ' + err.message));
  peers.set(id, peer);
  peer.reactions = peer.pc.createDataChannel('reactions');
  let lastReaction = 0;
  peer.reactions.onmessage = event => {
    if (!peers.has(id) || Date.now() - lastReaction < 250 || !REACTION_EMOJIS.includes(event.data)) return;
    lastReaction = Date.now(); broadcastReaction(event.data);
  };
  localStream.getTracks().forEach(track => peer.pc.addTrack(track, localStream));
  peer.pc.onconnectionstatechange = () => {
    if (['failed', 'closed'].includes(peer.pc.connectionState)) removeViewer(id);
    updateStatusText();
  };
  peer.listen(ref.child('answer'), 'value', async snapshot => {
    if (snapshot.val() && !peer.pc.remoteDescription) await peer.setRemoteDescription(snapshot.val());
  });
  try {
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    for (const sender of peer.pc.getSenders()) {
      if (sender.track.kind === 'video') {
        const params = sender.getParameters();
        params.encodings = params.encodings?.length ? params.encodings : [{}];
        params.encodings[0].maxBitrate = 450000;
        await sender.setParameters(params);
      }
    }
    await ref.child('offer').set({type: offer.type, sdp: offer.sdp});
  } catch (err) { removeViewer(id); setStatus('No se pudo conectar un espectador: ' + err.message); }
}
async function stop() {
  mediaGeneration++;
  enableReactions(false);
  stopBtn.disabled = true;
  if (viewersRef) {
    viewersRef.off('child_added', addedHandler);
    viewersRef.off('child_removed', removedHandler);
  }
  addedHandler = null; removedHandler = null;
  viewersRef = null;
  [...peers.keys()].forEach(removeViewer);
  localStream?.getTracks().forEach(track => track.stop());
  displayStream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null; displayStream = null;
  localStream = null; localVideo.srcObject = null;
  updateSourceControls();
  try {
    if (sessionRef) {
      await sessionRef.remove();
      await roomRef.child('sessionId').transaction(value => value === sessionId ? null : undefined);
      await sessionRef.onDisconnect().cancel();
      await roomRef.child('sessionId').onDisconnect().cancel();
    }
  } catch (err) { console.warn('Error al limpiar la sala', err); }
  sessionRef = null; roomRef = null; sessionId = null;
  running = false; startBtn.disabled = false;
  updateStatusText(); setStatus('Transmisión detenida.');
}
startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);
screenBtn.addEventListener('click', shareScreen);
cameraBtn.addEventListener('click', returnToCamera);
bindReactionButtons(broadcastReaction);

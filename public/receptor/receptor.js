const remoteVideo = document.getElementById('remoteVideo');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const playBtn = document.getElementById('playBtn');
const statusEl = document.getElementById('status');
let connection = null, viewerRef = null, roomRef = null, sessionListener = null;
let activeRef = null, activeHandler = null, currentSession = null, waiting = false, generation = 0;
const setStatus = text => { statusEl.textContent = text; };
let reactionChannel = null;
async function clearConnection() {
  enableReactions(false);
  if (reactionChannel) { reactionChannel.onmessage = null; reactionChannel.onopen = null; reactionChannel.onclose = null; reactionChannel.close(); }
  reactionChannel = null;
  generation++;
  if (activeRef) activeRef.off('value', activeHandler);
  activeRef = null; activeHandler = null;
  connection?.close(); connection = null;
  const oldViewer = viewerRef; viewerRef = null;
  if (oldViewer) await oldViewer.remove();
  remoteVideo.srcObject = null; playBtn.hidden = true;
}
async function joinSession(id) {
  const token = ++generation;
  await clearConnection();
  if (!waiting || generation !== token + 1) return;
  currentSession = id;
  if (!id) { setStatus('Esperando a que el emisor inicie una transmisión...'); return; }
  const ref = roomRef.child('sessions').child(id);
  viewerRef = ref.child('viewers').push();
  const ownRef = viewerRef;
  await ownRef.onDisconnect().remove();
  if (!waiting || currentSession !== id || viewerRef !== ownRef) return;
  connection = createSignaledPeer(ownRef, 'calleeCandidates', 'callerCandidates', err => setStatus('Error de conexión: ' + err.message));
  const peer = connection;
  peer.pc.ondatachannel = event => {
    if (event.channel.label !== 'reactions' || connection !== peer) return;
    reactionChannel = event.channel;
    reactionChannel.onmessage = message => showReaction(message.data);
    reactionChannel.onopen = () => enableReactions(true);
    reactionChannel.onclose = () => enableReactions(false);
    enableReactions(reactionChannel.readyState === 'open');
  };
  peer.pc.ontrack = event => {
    if (event.streams?.[0]) { remoteVideo.srcObject = event.streams[0]; tryPlay(); }
  };
  peer.pc.onconnectionstatechange = () => {
    if (peer.pc.connectionState === 'connected') setStatus('Conectado. Recibiendo transmisión en vivo.');
    if (['failed', 'disconnected'].includes(peer.pc.connectionState)) setStatus('Conexión interrumpida. Desconecta y vuelve a conectar.');
  };
  peer.listen(ownRef.child('offer'), 'value', async snapshot => {
    if (!snapshot.val() || peer.pc.remoteDescription) return;
    await peer.setRemoteDescription(snapshot.val());
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    await ownRef.child('answer').set({type: answer.type, sdp: answer.sdp});
  });
  activeRef = ref.child('active');
  activeHandler = snapshot => {
    if (snapshot.val() === false && currentSession === id) {
      currentSession = null;
      clearConnection().catch(err => setStatus(err.message));
      setStatus('Transmisión finalizada. Esperando el siguiente directo...');
    }
  };
  activeRef.on('value', activeHandler);
  await ownRef.child('joined').set(true);
}
async function tryPlay() {
  try { await remoteVideo.play(); playBtn.hidden = true; }
  catch { playBtn.hidden = false; }
}
function connect() {
  if (waiting) return;
  waiting = true; connectBtn.disabled = true; disconnectBtn.disabled = false;
  setStatus('Esperando una transmisión...');
  roomRef = db.ref(ROOM_PATH);
  sessionListener = snapshot => {
    const id = snapshot.val();
    if (id === currentSession && connection) return;
    joinSession(id).catch(async err => { await disconnect(); setStatus('No se pudo conectar: ' + err.message); });
  };
  roomRef.child('sessionId').on('value', sessionListener, async err => { await disconnect(); setStatus('No se pudo acceder a la sala: ' + err.message); });
}
async function disconnect() {
  waiting = false;
  if (roomRef && sessionListener) roomRef.child('sessionId').off('value', sessionListener);
  sessionListener = null; currentSession = null;
  await clearConnection();
  connectBtn.disabled = false; disconnectBtn.disabled = true;
  setStatus('Desconectado. Puedes volver a entrar cuando quieras.');
}
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', () => disconnect().catch(err => setStatus(err.message)));
playBtn.addEventListener('click', tryPlay);
bindReactionButtons(emoji => {
  if (reactionChannel?.readyState === 'open') {
    try { reactionChannel.send(emoji); } catch { setStatus('No se pudo enviar la reacción. Vuelve a conectar.'); }
  }
});

// Cada conexión solo escucha la señalización de su receptor.
function createSignaledPeer(ref, outgoingPath, incomingPath, onError) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const detach = [];
  const pending = [];
  let closed = false;
  let chain = Promise.resolve();
  function report(err) { if (!closed) onError(err); }
  function enqueue(task) {
    const result = chain.then(async () => { if (!closed) await task(); });
    chain = result.catch(report);
    return result;
  }
  function listen(target, event, callback) {
    const handler = snapshot => {
      if (!closed) Promise.resolve().then(() => { if (!closed) return callback(snapshot); }).catch(report);
    };
    target.on(event, handler, report);
    detach.push(() => target.off(event, handler));
  }
  pc.onicecandidate = event => {
    if (!closed && event.candidate) ref.child(outgoingPath).push(event.candidate.toJSON()).catch(report);
  };
  listen(ref.child(incomingPath), 'child_added', snapshot => enqueue(async () => {
    const candidate = snapshot.val();
    if (!candidate) return;
    if (!pc.remoteDescription) pending.push(candidate);
    else await pc.addIceCandidate(candidate);
  }));
  return {
    pc, listen,
    setRemoteDescription: description => enqueue(async () => {
      await pc.setRemoteDescription(description);
      while (!closed && pending.length) await pc.addIceCandidate(pending.shift());
    }),
    close() {
      closed = true;
      detach.forEach(remove => remove());
      pending.length = 0;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.ondatachannel = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
  };
}

// Interacciones de presentación. La señalización se mantiene en emisor/receptor.
const role = document.body.dataset.page;
document.querySelectorAll(`[data-page="${role}"]`).forEach(el => { if(el.tagName === 'A') el.setAttribute('aria-current', 'page'); });
document.querySelector('.menu-button').addEventListener('click', event => {
  const open = document.body.classList.toggle('menu-open');
  event.currentTarget.setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', e => { if(e.key === 'Escape') { document.body.classList.remove('menu-open'); document.querySelector('.menu-button').setAttribute('aria-expanded','false'); } });
let toastTimer;
function notify(text) { const el=document.querySelector('.toast'); el.textContent=text; el.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.hidden=true,4000); }
document.querySelectorAll('[data-share]').forEach(button => button.addEventListener('click', async () => {
  const url = new URL('/receptor', location.href).href;
  try { await navigator.clipboard.writeText(url); notify('Enlace de la sala copiado.'); } catch { notify('Enlace de la sala: ' + url); }
}));
const follow=document.querySelector('.follow');
if(follow) {
  let saved=false;
  try { saved=localStorage.getItem('cauce-follow')==='true'; } catch {}
  const render=()=>{ follow.setAttribute('aria-pressed',String(saved)); follow.textContent=saved?'✓ Siguiendo':'Seguir canal'; };
  render(); follow.addEventListener('click',()=>{ saved=!saved; try { localStorage.setItem('cauce-follow',String(saved)); } catch {} render(); notify(saved?'Canal guardado en este navegador.':'Canal eliminado de tus seguidos.'); });
}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-filter]').forEach(chip=>{ const active=chip===button; chip.classList.toggle('active',active); chip.setAttribute('aria-pressed',String(active)); });
  document.querySelectorAll('[data-category]').forEach(card=>card.hidden=button.dataset.filter!=='all' && card.dataset.category!==button.dataset.filter);
}));
const dialog=document.querySelector('dialog');
if(dialog) {
  dialog.setAttribute('aria-labelledby','dialogTitle');
  document.querySelectorAll('.collection').forEach(card=>card.addEventListener('click',()=>{ document.getElementById('dialogTitle').textContent=card.dataset.title; document.getElementById('dialogDescription').textContent=card.dataset.description; dialog.showModal(); }));
  document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog && (e.clientX<dialog.getBoundingClientRect().left || e.clientX>dialog.getBoundingClientRect().right || e.clientY<dialog.getBoundingClientRect().top || e.clientY>dialog.getBoundingClientRect().bottom)) dialog.close();});
}
const video=document.querySelector('video');
if(video) {
  const player=document.getElementById('player');
  const update=()=>{ const active=Boolean(video.srcObject); player.classList.toggle('has-stream',active); document.getElementById('stateBadge').textContent=active?(role==='emisor'?'TRANSMITIENDO':'SEÑAL RECIBIDA'):(role==='emisor'?'SIN TRANSMITIR':'SIN SEÑAL'); };
  ['loadedmetadata','emptied','playing'].forEach(event=>video.addEventListener(event,update));
  new MutationObserver(update).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});
  document.querySelector('[data-fullscreen]').addEventListener('click',async()=>{ try { if(document.fullscreenElement) await document.exitFullscreen(); else await player.requestFullscreen(); } catch { notify('Tu navegador no permite pantalla completa en este momento.'); } });
}

const REACTION_EMOJIS = ['💗', '👍', '😂', '😮', '🔥'];
function showReaction(emoji) {
  if (!REACTION_EMOJIS.includes(emoji)) return;
  const layer = document.getElementById('reactionLayer');
  if (!layer) return;
  while (layer.childElementCount >= 30) layer.firstElementChild.remove();
  const bubble = document.createElement('span');
  bubble.className = 'reaction-bubble';
  bubble.textContent = emoji;
  bubble.style.left = `${10 + Math.random() * 75}%`;
  layer.appendChild(bubble);
  setTimeout(() => bubble.remove(), 2400);
}
function bindReactionButtons(send) {
  let last = 0;
  document.querySelectorAll('[data-reaction]').forEach(button => {
    button.addEventListener('click', () => {
      if (Date.now() - last < 300) return;
      last = Date.now();
      send(button.dataset.reaction);
    });
  });
}
function enableReactions(enabled) {
  document.querySelectorAll('[data-reaction]').forEach(button => { button.disabled = !enabled; });
  if (!enabled) document.getElementById('reactionLayer')?.replaceChildren();
}

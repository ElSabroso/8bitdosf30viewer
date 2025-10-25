// --- Función para reemplazar texto por emotes ---
function replaceEmotesInNode(node) {
  if (!node || !node.innerHTML) return;
  let text = node.innerHTML;
  for (let code in emotes) {
    let url = emotes[code];
    let regex = new RegExp(`\\b${code}\\b`, "g");
    text = text.replace(regex, `<img class="emote" src="${url}" alt="${code}">`);
  }
  node.innerHTML = text;
}

// --- Observer para interceptar mensajes nuevos ---
const chatContainer = document.querySelector("#output"); // el contenedor raíz

const observer = new MutationObserver(mutations => {
  mutations.forEach(m => {
    m.addedNodes.forEach(node => {
      if (node.nodeType === 1) {
        // Buscar dentro de cada mensaje el div con clase hl-message hl-content
        const msg = node.querySelector(".hl-message.hl-content");
        if (msg) replaceEmotesInNode(msg);
      }
    });
  });
});

if (chatContainer) {
  observer.observe(chatContainer, { childList: true, subtree: true });
}

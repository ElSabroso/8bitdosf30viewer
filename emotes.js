(() => {
  console.log("[EmoteScript] Starting");

  const EMOTES = new Map();
  const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let EMOTE_REGEX = null;

  function rebuildRegex() {
    if (EMOTES.size === 0) return;
    const parts = Array.from(EMOTES.keys()).map(escapeRegex);
    // detecta emotes como tokens separados por espacios
    EMOTE_REGEX = new RegExp(`(^|\\s)(${parts.join("|")})(?=\\s|$)`, "g");
    console.log(`[EmoteScript] Regex built with ${parts.length} codes`);
  }

  // Cargar emotes (globales + FFZ canal team_sabroso)
  Promise.all([
    fetch("https://api.frankerfacez.com/v1/set/global").then(r=>r.json()).then(data=>{
      for (const setId in data.sets) {
        for (const e of data.sets[setId].emoticons) EMOTES.set(e.name, "https:" + (e.urls["2"] || e.urls["1"]));
      }
    }).catch(console.warn),
    fetch("https://api.frankerfacez.com/v1/room/team_sabroso").then(r=>r.json()).then(data=>{
      const sets = data.sets || {};
      for (const setId in sets) {
        for (const e of sets[setId].emoticons) EMOTES.set(e.name, "https:" + (e.urls["2"] || e.urls["1"]));
      }
    }).catch(console.warn),
    fetch("https://api.betterttv.net/3/cached/emotes/global").then(r=>r.json()).then(list=>{
      for (const e of list) EMOTES.set(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`);
    }).catch(console.warn),
    fetch("https://7tv.io/v3/emote-sets/global").then(r=>r.json()).then(data=>{
      const ems = data.emotes || [];
      for (const e of ems) EMOTES.set(e.name, `${e.data.host.url}/2x.webp`);
    }).catch(console.warn)
  ]).then(()=> {
    rebuildRegex();
    attachEverywhere();
  });

  // Reemplazo de nodos de texto sin usar innerHTML
  function replaceTextNodes(root) {
    if (!EMOTE_REGEX) return;
    const walker = (root.ownerDocument || document).createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        // evitar script/style/textarea y atributos
        const tag = p.tagName ? p.tagName.toLowerCase() : "";
        if (tag === "script" || tag === "style" || tag === "textarea") return NodeFilter.FILTER_REJECT;
        // si ya hay imagen emote, omitir
        if (p.classList && (p.classList.contains("emote-wrapper") || p.classList.contains("emote"))) return NodeFilter.FILTER_REJECT;
        // texto útil
        return node.nodeValue && /\S/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const textNode of nodes) {
      const original = textNode.nodeValue;
      EMOTE_REGEX.lastIndex = 0;
      if (!EMOTE_REGEX.test(original)) continue;

      const frag = (root.ownerDocument || document).createDocumentFragment();
      let lastIndex = 0;
      EMOTE_REGEX.lastIndex = 0;
      let match;

      while ((match = EMOTE_REGEX.exec(original)) !== null) {
        const [full, leadSpace, code] = match;
        const start = match.index;
        const end = start + full.length;

        if (start > lastIndex) frag.appendChild((root.ownerDocument || document).createTextNode(original.slice(lastIndex, start)));
        if (leadSpace) frag.appendChild((root.ownerDocument || document).createTextNode(leadSpace));

        const url = EMOTES.get(code);
        if (url) {
          const span = (root.ownerDocument || document).createElement("span");
          span.className = "emote-wrapper";
          const img = (root.ownerDocument || document).createElement("img");
          img.className = "emote";
          img.alt = code;
          img.src = url;
          span.appendChild(img);
          frag.appendChild(span);
        } else {
          frag.appendChild((root.ownerDocument || document).createTextNode(code));
        }
        lastIndex = end;
      }
      if (lastIndex < original.length) frag.appendChild((root.ownerDocument || document).createTextNode(original.slice(lastIndex)));

      if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  // Observa un root (document, shadowRoot, iframe document)
  function observeRoot(root) {
    if (!root) return;
    try {
      replaceTextNodes(root);
      const observer = new MutationObserver(muts => {
        for (const m of muts) {
          for (const node of m.addedNodes) {
            if (node && node.nodeType === 1) replaceTextNodes(node);
          }
        }
      });
      observer.observe(root, { childList: true, subtree: true });
    } catch (e) {
      console.warn("[EmoteScript] observeRoot error", e);
    }
  }

  // Entrar en Shadow DOM abiertos
  function attachShadowObservers(rootEl) {
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT, null);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (el && el.shadowRoot) {
        observeRoot(el.shadowRoot);
        // también observar dentro de ese shadow por nuevos elementos con shadowRoot
        const mo = new MutationObserver(muts => {
          for (const m of muts) {
            m.addedNodes.forEach(n => {
              if (n.nodeType === 1 && n.shadowRoot) observeRoot(n.shadowRoot);
            });
          }
        });
        mo.observe(el.shadowRoot, { childList: true, subtree: true });
      }
    }
  }

  // Adjuntar en iframes de mismo origen
  function attachIframeObservers() {
    document.querySelectorAll("iframe").forEach(iframe => {
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          observeRoot(doc);
          // también intentar entrar a shadow dentro del iframe
          attachShadowObservers(doc);
        }
      } catch (e) {
        // si es cross-origin, no se puede
      }
    });
  }

  function attachEverywhere() {
    console.log("[EmoteScript] Attaching observers");
    observeRoot(document);
    attachShadowObservers(document);
    attachIframeObservers();

    // Reintentos en caso de que el chat se monte tarde
    let tries = 0;
    const retry = setInterval(() => {
      tries++;
      attachShadowObservers(document);
      attachIframeObservers();
      replaceTextNodes(document.body);
      if (tries > 20) clearInterval(retry); // ~20 reintentos
    }, 1000);
  }

  // Si el DOM aún no está listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachEverywhere);
  } else {
    attachEverywhere();
  }

  console.log("[EmoteScript] Ready");
})();

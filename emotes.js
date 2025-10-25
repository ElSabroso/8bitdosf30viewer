(() => {
  // Cache de emotes: { code: url }
  const EMOTES = new Map();

  // Utilidad: escapar nombres de emotes en regex
  const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Carga FFZ global
  fetch("https://api.frankerfacez.com/v1/set/global")
    .then(r => r.json())
    .then(data => {
      for (const setId in data.sets) {
        for (const e of data.sets[setId].emoticons) {
          const url = ("https:" + (e.urls["2"] || e.urls["1"]));
          EMOTES.set(e.name, url);
        }
      }
      rebuildRegex();
    })
    .catch(() => {});

  // Carga FFZ de tu canal
  fetch("https://api.frankerfacez.com/v1/room/team_sabroso")
    .then(r => r.json())
    .then(data => {
      const sets = data.sets || {};
      for (const setId in sets) {
        for (const e of sets[setId].emoticons) {
          const url = ("https:" + (e.urls["2"] || e.urls["1"]));
          EMOTES.set(e.name, url);
        }
      }
      rebuildRegex();
    })
    .catch(() => {});

  // BTTV globales
  fetch("https://api.betterttv.net/3/cached/emotes/global")
    .then(r => r.json())
    .then(list => {
      for (const e of list) {
        EMOTES.set(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`);
      }
      rebuildRegex();
    })
    .catch(() => {});

  // 7TV globales
  fetch("https://7tv.io/v3/emote-sets/global")
    .then(r => r.json())
    .then(data => {
      const emotes = data.emotes || [];
      for (const e of emotes) {
        // host.url ya incluye base; 2x suele ser suficiente
        EMOTES.set(e.name, `${e.data.host.url}/2x.webp`);
      }
      rebuildRegex();
    })
    .catch(() => {});

  // Si me das tu Twitch ID numérico, activo BTTV/7TV de canal:
  // const TWITCH_ID = ""; // <- por ahora vacío
  // if (TWITCH_ID) {
  //   fetch(`https://api.betterttv.net/3/cached/users/twitch/${TWITCH_ID}`)
  //     .then(r => r.json())
  //     .then(data => {
  //       [...(data.channelEmotes||[]), ...(data.sharedEmotes||[])].forEach(e => {
  //         EMOTES.set(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`);
  //       });
  //       rebuildRegex();
  //     }).catch(()=>{});
  //
  //   fetch(`https://7tv.io/v3/users/twitch/${TWITCH_ID}`)
  //     .then(r => r.json())
  //     .then(data => {
  //       const set = data.emote_set && data.emote_set.emotes ? data.emote_set.emotes : [];
  //       set.forEach(e => {
  //         EMOTES.set(e.name, `${e.data.host.url}/2x.webp`);
  //       });
  //       rebuildRegex();
  //     }).catch(()=>{});
  // }

  // Regex combinada dinámica, reconstruida al cargar emotes
  let EMOTE_REGEX = null;
  function rebuildRegex() {
    if (EMOTES.size === 0) return;
    const parts = Array.from(EMOTES.keys()).map(escapeRegex);
    // Palabra completa (bordes) para evitar reemplazar dentro de URLs o texto
    EMOTE_REGEX = new RegExp(`(^|\\s)(${parts.join("|")})(?=\\s|$)`, "g");
  }

  // Reemplazo robusto: sólo nodos de texto -> inserta <img> sin usar innerHTML
  function replaceTextNodes(root) {
    if (!EMOTE_REGEX) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        // Ignorar nodos vacíos o con sólo espacios
        return node.nodeValue && /\S/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const toProcess = [];
    while (walker.nextNode()) toProcess.push(walker.currentNode);

    for (const textNode of toProcess) {
      const original = textNode.nodeValue;
      if (!EMOTE_REGEX.test(original)) continue;

      // Construir un fragmento con texto y <img> alternados
      const frag = document.createDocumentFragment();
      let lastIndex = 0;
      EMOTE_REGEX.lastIndex = 0;
      let match;
      while ((match = EMOTE_REGEX.exec(original)) !== null) {
        const [full, leadSpace, code] = match;
        const start = match.index;
        const end = start + full.length;

        // Texto previo
        if (start > lastIndex) {
          frag.appendChild(document.createTextNode(original.slice(lastIndex, start)));
        }
        // Espacio líder si existe
        if (leadSpace) frag.appendChild(document.createTextNode(leadSpace));

        // Emote image
        const url = EMOTES.get(code);
        if (url) {
          const span = document.createElement("span");
          span.className = "emote-wrapper ssnemote-inline";
          const img = document.createElement("img");
          img.className = "emote";
          img.alt = code;
          img.src = url;
          span.appendChild(img);
          frag.appendChild(span);
        } else {
          // Si por alguna razón no está, deja el texto tal cual
          frag.appendChild(document.createTextNode(code));
        }
        lastIndex = end;
      }

      // Texto restante
      if (lastIndex < original.length) {
        frag.appendChild(document.createTextNode(original.slice(lastIndex)));
      }

      // Reemplazar el nodo
      textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  // Observador global: detecta mensajes nuevos en todo el documento
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        // Heurística: procesa nodos que parezcan mensajes (puedes afinarla)
        // - Si SSN usa roles o clases específicas, ajusta aquí
        replaceTextNodes(node);
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Procesar lo ya presente al cargar
  replaceTextNodes(document.body);
})();

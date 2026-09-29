/*
 * Gemeinsame Bausteine für Schüler-App und Lehrer-Dashboard:
 * Icons (nachgezeichnet im X-Stil), Textaufbereitung, Zeitangaben, Post-HTML.
 */

const P = {
  logo: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  reply: "M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z",
  repost: "M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z",
  like: "M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z",
  liked: "M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z",
  views: "M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z",
  bookmark: "M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z",
  bookmarked: "M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z",
  share: "M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z",
  more: "M3 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9 2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm7 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z",
  verified: "M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z",
  pin: "M7 4.5C7 3.12 8.12 2 9.5 2h5C15.88 2 17 3.12 17 4.5v5.26L20.12 16H13v5l-1 2-1-2v-5H3.88L7 9.76V4.5z",
  homeFill: "M21.591 7.146L12.52 1.157c-.316-.21-.724-.21-1.04 0l-9.071 5.99c-.26.173-.409.456-.409.757v13.183c0 .502.418.913.929.913H9.14c.51 0 .929-.41.929-.913v-7.075h3.909v7.075c0 .502.417.913.928.913h6.165c.511 0 .929-.41.929-.913V7.904c0-.301-.158-.584-.408-.758z",
  search: "M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z",
  grok: "M2.205 7.423L11.745 21h4.241L6.446 7.423H2.204zm4.237 7.541L2.2 21h4.243l2.12-3.017-2.121-3.02zM16.957 0L9.624 10.435l2.122 3.02L21.2 0h-4.243zm.767 6.456V21h3.476V1.51l-3.476 4.946z",
  bell: "M19.993 9.042C19.48 5.017 16.054 2 11.996 2s-7.49 3.021-7.999 7.051L2.866 18H7.1c.463 2.282 2.481 4 4.9 4s4.437-1.718 4.9-4h4.236l-1.143-8.958zM12 20c-1.306 0-2.417-.835-2.829-2h5.658c-.412 1.165-1.523 2-2.829 2zm-6.866-4l.847-6.698C6.364 6.272 8.941 4 11.996 4s5.627 2.268 6.013 5.295L18.864 16H5.134z",
  mail: "M1.998 5.5c0-1.381 1.119-2.5 2.5-2.5h15c1.381 0 2.5 1.119 2.5 2.5v13c0 1.381-1.119 2.5-2.5 2.5h-15c-1.381 0-2.5-1.119-2.5-2.5v-13zm2.5-.5c-.276 0-.5.224-.5.5v2.764l8 3.638 8-3.636V5.5c0-.276-.224-.5-.5-.5h-15zm15.5 5.463l-8 3.636-8-3.638V18.5c0 .276.224.5.5.5h15c.276 0 .5-.224.5-.5v-8.037z",
  compose: "M23 3c-6.62-.1-10.38 2.421-13.05 6.03C7.29 12.61 6 17.331 6 22h2c0-1.007.07-2.012.19-3H12c4.1 0 7.48-3.082 7.94-7.054C22.79 10.147 23.17 6.359 23 3zm-7 8h-1.5v2H16c.63-.016 1.2-.08 1.72-.188C16.95 15.24 14.68 17 12 17H8.55c.57-2.512 1.57-4.851 3-6.78 2.16-2.912 5.29-4.911 9.45-5.187C20.95 8.079 19.9 11 16 11zM4 9V6H1V4h3V1h2v3h3v2H6v3H4z",
  image: "M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v9.086l3-3 3 3 5-5 3 3V5.5c0-.276-.224-.5-.5-.5h-13zM19 15.414l-3-3-5 5-3-3-3 3V18.5c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-3.086zM9.75 7C8.784 7 8 7.784 8 8.75s.784 1.75 1.75 1.75 1.75-.784 1.75-1.75S10.716 7 9.75 7z",
  gif: "M3 5.5C3 4.119 4.12 3 5.5 3h13C19.88 3 21 4.119 21 5.5v13c0 1.381-1.12 2.5-2.5 2.5h-13C4.12 21 3 19.881 3 18.5v-13zM5.5 5c-.28 0-.5.224-.5.5v13c0 .276.22.5.5.5h13c.28 0 .5-.224.5-.5v-13c0-.276-.22-.5-.5-.5h-13zM18 10.711V9.25h-3.74v5.5h1.44v-1.719h1.7V11.57h-1.7v-.859H18zM11.79 9.25h1.44v5.5h-1.44v-5.5zm-3.07 1.375c.34 0 .77.172 1.02.43l1.03-.86c-.51-.601-1.28-.945-2.05-.945C7.19 9.25 6 10.453 6 12s1.19 2.75 2.72 2.75c.85 0 1.54-.344 2.05-.945v-2.149H8.38v1.032H9.4v.515c-.17.086-.42.172-.68.172-.76 0-1.36-.602-1.36-1.375 0-.688.6-1.375 1.36-1.375z",
  poll: "M6 5c-1.1 0-2 .895-2 2s.9 2 2 2 2-.895 2-2-.9-2-2-2zM2 7c0-2.209 1.79-4 4-4s4 1.791 4 4-1.79 4-4 4-4-1.791-4-4zm20 1H12V6h10v2zM6 15c-1.1 0-2 .895-2 2s.9 2 2 2 2-.895 2-2-.9-2-2-2zm-4 2c0-2.209 1.79-4 4-4s4 1.791 4 4-1.79 4-4 4-4-1.791-4-4zm20 1H12v-2h10v2zM7 7c0 .552-.45 1-1 1s-1-.448-1-1 .45-1 1-1 1 .448 1 1z",
  emoji: "M8 9.5C8 8.119 8.672 7 9.5 7S11 8.119 11 9.5 10.328 12 9.5 12 8 10.881 8 9.5zm6.5 2.5c.828 0 1.5-1.119 1.5-2.5S15.328 7 14.5 7 13 8.119 13 9.5s.672 2.5 1.5 2.5zM12 16c-2.224 0-3.021-2.227-3.051-2.316l-1.897.633c.05.15 1.271 3.684 4.949 3.684s4.898-3.533 4.949-3.684l-1.896-.638c-.033.095-.83 2.322-3.053 2.322zm10.25-4.001c0 5.652-4.598 10.25-10.25 10.25S1.75 17.652 1.75 12 6.348 1.75 12 1.75 22.25 6.348 22.25 12zm-2 0c0-4.549-3.701-8.25-8.25-8.25S3.75 7.451 3.75 12s3.701 8.25 8.25 8.25 8.25-3.701 8.25-8.25z",
  schedule: "M6 3V2h2v1h6V2h2v1h1.5C18.88 3 20 4.12 20 5.5v2h-2v-2c0-.28-.22-.5-.5-.5H16v1h-2V5H8v1H6V5H4.5c-.28 0-.5.22-.5.5v12c0 .28.22.5.5.5h3v2h-3C3.12 20 2 18.88 2 17.5v-12C2 4.12 3.12 3 4.5 3H6zm9.5 8c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zM9 15.5C9 11.91 11.91 9 15.5 9s6.5 2.91 6.5 6.5-2.91 6.5-6.5 6.5S9 19.09 9 15.5zm5.5-2.5h2v2.09l1.5 1.5-1.41 1.41-2.09-2.08V13z",
  location: "M12 7c-1.93 0-3.5 1.57-3.5 3.5S10.07 14 12 14s3.5-1.57 3.5-3.5S13.93 7 12 7zm0 5c-.827 0-1.5-.673-1.5-1.5S11.173 9 12 9s1.5.673 1.5 1.5S12.827 12 12 12zm0-10c-4.687 0-8.5 3.813-8.5 8.5 0 5.967 7.621 11.116 7.945 11.332l.555.37.555-.37c.324-.216 7.945-5.365 7.945-11.332C20.5 5.813 16.687 2 12 2zm0 17.77c-1.665-1.241-6.5-5.196-6.5-9.27C5.5 6.916 8.416 4 12 4s6.5 2.916 6.5 6.5c0 4.073-4.835 8.028-6.5 9.27z",
  globe: "M12 1.75C6.34 1.75 1.75 6.34 1.75 12S6.34 22.25 12 22.25 22.25 17.66 22.25 12 17.66 1.75 12 1.75zm-.25 10.48L10.5 17.5l-2-1.5v-3.5L7.5 9 5.03 7.59c1.42-2.24 3.89-3.75 6.72-3.84L11 6l-2 .5L8.5 9l5 1.5-1.75 1.73zM17 14v-3l-1.5-3 2.88-1.23c1.17 1.42 1.87 3.24 1.87 5.23 0 1.3-.3 2.52-.83 3.61L17 14z",
  back: "M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z",
  close: "M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z",
  trash: "M16 6V4.5C16 3.12 14.88 2 13.5 2h-3C9.11 2 8 3.12 8 4.5V6H3v2h1.06l.81 11.21C4.98 20.78 6.28 22 7.86 22h8.27c1.58 0 2.88-1.22 3-2.79L19.93 8H21V6h-5zm-6-1.5c0-.28.22-.5.5-.5h3c.27 0 .5.22.5.5V6h-4V4.5zm7.13 14.57c-.04.52-.47.93-1 .93H7.86c-.53 0-.96-.41-1-.93L6.07 8h11.85l-.79 11.07z",
  edit: "M14.23 2.854c.98-.977 2.56-.977 3.54 0l3.38 3.378c.97.977.97 2.559 0 3.536L9.91 21H3v-6.914L14.23 2.854zm2.12 1.414c-.19-.195-.51-.195-.7 0L5 14.914V19h4.09L19.73 8.354c.2-.196.2-.512 0-.708l-3.38-3.378z",
  plus: "M11 11V4h2v7h7v2h-7v7h-2v-7H4v-2h7z",
  person: "M5.651 19h12.698c-.337-1.8-1.023-3.21-1.945-4.19C15.318 13.65 13.838 13 12 13s-3.317.65-4.404 1.81c-.922.98-1.608 2.39-1.945 4.19zm.486-5.56C7.627 11.85 9.648 11 12 11s4.373.85 5.863 2.44c1.477 1.58 2.366 3.8 2.632 6.46l.11 1.1H3.395l.11-1.1c.266-2.66 1.155-4.88 2.632-6.46zM12 4c-1.105 0-2 .9-2 2s.895 2 2 2 2-.9 2-2-.895-2-2-2zM8 6c0-2.21 1.791-4 4-4s4 1.79 4 4-1.791 4-4 4-4-1.79-4-4z",
  moon: "M20.742 13.045c-.677.18-1.376.271-2.077.271-2.135 0-4.14-.83-5.646-2.336-2.025-2.021-2.799-4.993-2.064-7.735.1-.376-.008-.78-.285-1.057-.277-.278-.68-.38-1.057-.285-1.64.44-3.14 1.302-4.339 2.5-3.66 3.662-3.66 9.617 0 13.28 1.772 1.774 4.132 2.753 6.638 2.753s4.867-.975 6.64-2.75c1.2-1.198 2.062-2.698 2.5-4.338.1-.377-.008-.78-.285-1.057-.276-.276-.68-.382-1.057-.28zm-2.572 4.26c-1.4 1.4-3.26 2.17-5.24 2.17s-3.84-.77-5.24-2.17c-2.89-2.89-2.89-7.593 0-10.484.73-.73 1.584-1.293 2.518-1.664-.216 2.93.832 5.855 2.95 7.972 2.117 2.12 5.043 3.17 7.975 2.95-.37.935-.934 1.79-1.663 2.52z",
  flag: "M3 2h18.61l-3.5 7 3.5 7H5v6H3V2zm2 12h13.38l-2.5-5 2.5-5H5v10z",
};

export function icon(name, cls = "") {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" class="ic ${cls}"><g><path d="${P[name]}"></path></g></svg>`;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

/* Hashtags, @Erwähnungen und Links blau – wie im echten Feed */
const TOKEN_RE =
  /(https?:\/\/[^\s<>"]+)|(^|[^\p{L}\p{N}_&])([#＃][\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)|(^|[^\p{L}\p{N}_@])(@[A-Za-z0-9_]{1,15})/gu;

export function formatiere(text) {
  let out = "";
  let last = 0;
  const s = String(text ?? "");
  for (const m of s.matchAll(TOKEN_RE)) {
    out += esc(s.slice(last, m.index));
    if (m[1]) {
      const anzeige = m[1].replace(/^https?:\/\/(www\.)?/, "");
      out += `<span class="lnk">${esc(anzeige.length > 26 ? anzeige.slice(0, 25) + "…" : anzeige)}</span>`;
    } else if (m[3]) {
      out += esc(m[2]) + `<span class="lnk">${esc(m[3])}</span>`;
    } else {
      out += esc(m[4]) + `<span class="lnk">${esc(m[5])}</span>`;
    }
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

/* Zahlen wie bei X: 1.234 / 12.345 / 1,2 Mio. */
export function zahl(n) {
  if (!n) return "";
  if (n < 10000) return n.toLocaleString("de-DE");
  if (n < 1e6) return (Math.floor(n / 100) / 10).toLocaleString("de-DE") + " Tsd.";
  return (Math.floor(n / 1e5) / 10).toLocaleString("de-DE") + " Mio.";
}

const MONATE = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];

export function relativ(ts, jetzt = Date.now()) {
  const s = Math.max(0, Math.floor((jetzt - ts) / 1000));
  if (s < 60) return `${Math.max(1, s)} Sek.`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} Std.`;
  const d = new Date(ts);
  return `${d.getDate()}. ${MONATE[d.getMonth()]}`;
}

export function uhrzeit(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function langesDatum(ts) {
  const d = new Date(ts);
  return `${uhrzeit(ts)} · ${d.getDate()}. ${MONATE[d.getMonth()]} ${d.getFullYear()}`;
}

export function avatarHtml(a, size = 40) {
  const e = a?.e ?? "🙂";
  const c = a?.c ?? "#1D9BF0";
  return `<div class="av" style="--av:${esc(c)};--s:${size}px"><span>${esc(e)}</span></div>`;
}

/* Angehefteter Aufgaben-Post aus den Raum-Einstellungen */
export function pinAusRaum(raum) {
  const p = raum.pin;
  return {
    id: "pinned",
    name: p.name,
    handle: p.handle,
    avatar: { e: p.e, c: p.c },
    verified: p.verifiziert,
    text: p.text,
    ts: p.ts,
  };
}

export function bildUrl(raum) {
  return raum.bild ? `/api/r/${encodeURIComponent(raum.code)}/bild?v=${raum.bild.v}` : "";
}

/* Mini-Format für den Erwartungshorizont:
   „## Überschrift“, „- Aufzählung“, **fett**, Leerzeile = neuer Absatz */
export function ehHtml(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  let out = "", liste = false;
  for (const zeile of String(text ?? "").split("\n")) {
    const z = zeile.trim();
    const istPunkt = /^[-•*]\s+/.test(z);
    if (liste && !istPunkt) { out += "</ul>"; liste = false; }
    if (!z) continue;
    if (z.startsWith("## ")) out += `<h3>${inline(z.slice(3))}</h3>`;
    else if (istPunkt) { if (!liste) { out += "<ul>"; liste = true; } out += `<li>${inline(z.replace(/^[-•*]\s+/, ""))}</li>`; }
    else out += `<p>${inline(z)}</p>`;
  }
  return out + (liste ? "</ul>" : "");
}

/**
 * Post-HTML im Timeline-Look.
 * opt.aktionen: Aktionsleiste zeigen · opt.menu: „…" zeigen · opt.jetzt: Serverzeit
 */
export function postHtml(p, opt = {}) {
  const jetzt = opt.jetzt ?? Date.now();
  const bearbeitet = p.edited
    ? `<div class="edited">${icon("edit")}Zuletzt bearbeitet ${uhrzeit(p.edited)}</div>`
    : "";
  const aktionen = opt.aktionen === false ? "" : `
    <div class="actions" role="group">
      <button class="act a-reply" data-act="reply" aria-label="Antworten">${icon("reply")}<span></span></button>
      <button class="act a-repost" data-act="repost" aria-label="Reposten">${icon("repost")}<span></span></button>
      <button class="act a-like ${p.liked ? "on" : ""}" data-act="like" aria-label="Gefällt mir">${icon(p.liked ? "liked" : "like")}<span class="cnt">${zahl(p.likes)}</span></button>
      <button class="act a-views" data-act="views" aria-label="Aufrufe">${icon("views")}<span>${zahl(p.views)}</span></button>
      <div class="act-end">
        <button class="act a-bm ${p.bookmarked ? "on" : ""}" data-act="bookmark" aria-label="Lesezeichen">${icon(p.bookmarked ? "bookmarked" : "bookmark")}</button>
        <button class="act a-share" data-act="share" aria-label="Teilen">${icon("share")}</button>
      </div>
    </div>`;
  return `
    <article class="post${p.hidden ? " is-hidden" : ""}" data-id="${esc(p.id)}">
      ${opt.oben ?? ""}
      <div class="post-row">
        <div class="post-av">${avatarHtml(p.avatar, opt.avSize ?? 40)}</div>
        <div class="post-main">
          <div class="post-head">
            <span class="nm">${esc(p.name)}</span>${p.verified ? icon("verified", "vf") : ""}
            <span class="hd">@${esc(p.handle)}</span><span class="dot">·</span><time>${relativ(p.ts, jetzt)}</time>
            ${opt.menu ? `<button class="more" data-act="menu" aria-label="Mehr">${icon("more")}</button>` : ""}
          </div>
          ${p.hidden && opt.hinweisVersteckt ? `<div class="hidden-note">Nur für dich sichtbar – die Lehrkraft hat diesen Post ausgeblendet.</div>` : ""}
          <div class="post-text" dir="auto">${formatiere(p.text)}</div>
          ${opt.medien ?? ""}
          ${bearbeitet}
          ${aktionen}
        </div>
      </div>
    </article>`;
}

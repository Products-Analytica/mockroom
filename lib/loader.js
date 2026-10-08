// Loads browser-only libraries (PDF and DOCX readers) from CDNs at runtime, outside the Next.js bundle.
const scripts = new Map();
export function loadScript(src){
  if(scripts.has(src)) return scripts.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
  scripts.set(src, p);
  return p;
}

// A persistent connection survives hidden/background tabs; browser close drops it.
let connection;
function connect(token) {
  connection?.close();
  connection = new EventSource('/api/session?token=' + encodeURIComponent(token));
}
async function start() {
  try {
    const response = await fetch('/api/config', {cache: 'no-store'});
    if (!response.ok) throw new Error('Session unavailable');
    const config = await response.json();
    connect(config.token);
  } catch {
    setTimeout(start, 1500);
  }
}
window.addEventListener('pagehide', () => connection?.close());
window.addEventListener('pageshow', event => { if (event.persisted) start(); });
start();

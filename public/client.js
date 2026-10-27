export const $ = (selector, scope = document) => scope.querySelector(selector);
export const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export async function api(path, data) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...(data === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error?.message || 'Permintaan gagal.');
    error.code = result.error?.code;
    throw error;
  }
  return result;
}

export class LiveGame {
  constructor(onState, onStatus, onAuth) {
    this.onState = onState;
    this.onStatus = onStatus;
    this.onAuth = onAuth;
    this.retry = 0;
    this.closed = false;
    this.epoch = 0;
  }

  async start() {
    this.closed = false;
    const epoch = ++this.epoch;
    this.socket?.close();
    try {
      const state = await api('/api/state');
      if (this.closed || epoch !== this.epoch) return;
      this.transport = state.transport === 'sse' ? 'sse' : 'websocket';
      this.onState(state);
      if (this.closed || epoch !== this.epoch) return;
      this.connect(epoch);
    } catch (error) {
      if (this.closed || epoch !== this.epoch) return;
      if (error.code === 'AUTH') this.onAuth();
      else {
        this.onStatus(error.message, false);
        this.schedule();
      }
    }
  }

  connect(epoch = this.epoch) {
    if (this.closed || epoch !== this.epoch) return;
    if (this.transport === 'sse') {
      this.connectSSE(epoch);
      return;
    }
    const current = () => !this.closed && epoch === this.epoch;
    this.onStatus('Menghubungkan…', false);
    const socket = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/api/live');
    this.socket = socket;
    socket.onopen = () => {
      if (!current()) return;
      this.retry = 0;
      this.onStatus('Terhubung langsung', true);
    };
    socket.onmessage = event => {
      if (!current()) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'state') this.onState(data.state);
      } catch {
        this.onStatus('Data tidak terbaca. Muat ulang.', false);
      }
    };
    socket.onclose = event => {
      if (!current()) return;
      if (event.code === 4001) {
        this.stop();
        this.onAuth();
        return;
      }
      this.onStatus('Koneksi terputus. Mencoba kembali…', false);
      this.schedule();
    };
    socket.onerror = () => {
      if (current()) this.onStatus('Sambungan terganggu…', false);
    };
  }

  connectSSE(epoch) {
    const current = () => !this.closed && epoch === this.epoch;
    this.onStatus('Menghubungkan…', false);
    const source = new EventSource('/api/live');
    this.socket = source;
    source.onopen = () => {
      if (!current()) return;
      this.retry = 0;
      this.onStatus('Terhubung langsung', true);
    };
    source.onmessage = event => {
      if (!current()) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'auth') {
          this.stop();
          this.onAuth();
        } else if (data.type === 'state') {
          this.onState(data.state);
        }
      } catch {
        this.onStatus('Data tidak terbaca. Muat ulang.', false);
      }
    };
    source.onerror = () => {
      if (!current()) return;
      this.epoch++;
      source.close();
      this.onStatus('Koneksi terputus. Mencoba kembali…', false);
      this.schedule();
    };
  }

  schedule() {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.start(), Math.min(15000, 1000 * 2 ** Math.min(this.retry++, 4)));
  }

  stop() {
    this.closed = true;
    this.epoch++;
    clearTimeout(this.timer);
    this.socket?.close();
  }
}

export async function copy(text, input, output) {
  try {
    await navigator.clipboard.writeText(text);
    output.textContent = 'Tautan disalin.';
  } catch {
    input?.focus();
    input?.select();
    output.textContent = 'Pilih teks lalu salin dengan Ctrl+C atau menu Salin.';
  }
}

export class CliRunner {
  constructor(opts = {}) {
    this.opts = { endpoint: "http://127.0.0.1:4311/run-template", ...opts };
  }

  async run(template, variables = {}) {
    try {
      const url = this.opts.endpoint;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, variables })
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return data;
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}

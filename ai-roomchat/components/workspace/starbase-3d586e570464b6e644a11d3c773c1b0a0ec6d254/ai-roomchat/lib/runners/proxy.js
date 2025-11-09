export class ProxyRunner {
  constructor(opts = {}) {
    this.opts = { endpoint: "/api/run-template", ...opts };
  }

  async run(template, variables = {}) {
    try {
      const res = await fetch(this.opts.endpoint, {
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


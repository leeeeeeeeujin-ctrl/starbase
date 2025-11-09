import { MockRunner } from "../../lib/runners/mock";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  try {
    const { template, variables } = req.body || {};
    if (!template) return res.status(400).json({ ok: false, error: "Missing template" });
    const runner = new MockRunner();
    const result = await runner.run(template, variables || {});
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}

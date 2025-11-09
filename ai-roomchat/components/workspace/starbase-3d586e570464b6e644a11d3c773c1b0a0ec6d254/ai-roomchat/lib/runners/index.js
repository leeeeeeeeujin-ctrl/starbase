import { MockRunner } from "./mock.js";
import { CliRunner } from "./cli.js";
import { ProxyRunner } from "./proxy.js";

export function createRunner(kind = "mock", options = {}) {
  switch (kind) {
    case "cli":
      return new CliRunner(options);
    case "proxy":
      return new ProxyRunner(options);
    case "mock":
    default:
      return new MockRunner(options);
  }
}


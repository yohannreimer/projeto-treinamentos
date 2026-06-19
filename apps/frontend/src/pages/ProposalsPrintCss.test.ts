import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("Proposals print stylesheet", () => {
  test("prints only proposal pages on clean A4 sheets", () => {
    expect(css).toContain("@page");
    expect(css).toContain("size: A4");
    expect(css).toContain("body:has(.proposals-page) .app-shell");
    expect(css).toContain("body:has(.proposals-page) .sidebar");
    expect(css).toContain("body:has(.proposals-page) .workspace-topbar");
    expect(css).toContain("body:has(.proposals-page) .proposals-preview-wrap");
    expect(css).toContain(".proposals-page .proposal-main-page");
    expect(css).toContain(".proposals-page .proposal-requirements-page");
    expect(css).toContain("break-after: page");
    expect(css).toContain("break-before: page");
  });
});

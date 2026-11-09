import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { attachNotificationPanelDismissal } from "../src/lib/notification-panel-events.mjs";

class FakeDocument {
  listeners = new Map();

  addEventListener(type, listener, capture) {
    const entries = this.listeners.get(type) ?? [];
    entries.push({ listener, capture });
    this.listeners.set(type, entries);
  }

  removeEventListener(type, listener, capture) {
    const entries = this.listeners.get(type) ?? [];
    this.listeners.set(type, entries.filter((entry) => entry.listener !== listener || entry.capture !== capture));
  }

  dispatch(type, event) {
    for (const { listener } of this.listeners.get(type) ?? []) listener(event);
  }
}

function region(children = []) {
  const node = {};
  node.contains = (target) => target === node || children.some((child) => child.contains(target));
  return node;
}

function setup() {
  const documentTarget = new FakeDocument();
  const triggerChild = region();
  const trigger = region([triggerChild]);
  const panelChild = region();
  const panel = region([panelChild]);
  let dismissCount = 0;
  const cleanup = attachNotificationPanelDismissal(documentTarget, {
    trigger,
    panel,
    onDismiss: () => { dismissCount += 1; },
  });
  return {
    documentTarget,
    triggerChild,
    panel,
    panelChild,
    outside: region(),
    cleanup,
    dismissCount: () => dismissCount,
  };
}

test("pointerdown outside the panel and trigger dismisses for mouse and touch", () => {
  const { documentTarget, outside, dismissCount } = setup();
  documentTarget.dispatch("pointerdown", { target: outside, pointerType: "mouse" });
  documentTarget.dispatch("pointerdown", { target: outside, pointerType: "touch" });
  assert.equal(dismissCount(), 2);
});

test("pointerdown inside the panel keeps it open, including on nested controls and scrolling", () => {
  const { documentTarget, panel, panelChild, dismissCount } = setup();
  documentTarget.dispatch("pointerdown", { target: panel });
  documentTarget.dispatch("pointerdown", { target: panelChild });
  documentTarget.dispatch("scroll", { target: panelChild });
  assert.equal(dismissCount(), 0);
});

test("pointerdown on the trigger does not dismiss before its click toggles the panel", async () => {
  const { documentTarget, triggerChild, dismissCount } = setup();
  documentTarget.dispatch("pointerdown", { target: triggerChild, pointerType: "touch" });
  assert.equal(dismissCount(), 0);

  const component = await readFile(new URL("../src/components/admin/NotificationCenter.jsx", import.meta.url), "utf8");
  assert.match(component, /const nextOpen = !open;[\s\S]*?setOpen\(nextOpen\)/);
});

test("Escape dismisses the panel", () => {
  const { documentTarget, dismissCount } = setup();
  documentTarget.dispatch("keydown", { key: "Escape" });
  documentTarget.dispatch("keydown", { key: "Enter" });
  assert.equal(dismissCount(), 1);
});

test("closing or unmounting removes pointer and keyboard listeners", () => {
  const { documentTarget, cleanup, outside, dismissCount } = setup();
  assert.equal(documentTarget.listeners.get("pointerdown").length, 1);
  assert.equal(documentTarget.listeners.get("keydown").length, 1);
  assert.equal(documentTarget.listeners.get("pointerdown")[0].capture, true);
  cleanup();
  assert.equal(documentTarget.listeners.get("pointerdown").length, 0);
  assert.equal(documentTarget.listeners.get("keydown").length, 0);
  documentTarget.dispatch("pointerdown", { target: outside });
  documentTarget.dispatch("keydown", { key: "Escape" });
  assert.equal(dismissCount(), 0);
});

test("notification read, bulk-read, refresh, and navigation actions remain wired", async () => {
  const component = await readFile(new URL("../src/components/admin/NotificationCenter.jsx", import.meta.url), "utf8");
  assert.match(component, /markAdminNotificationRead\(id\)/);
  assert.match(component, /markAllAdminNotificationsRead\(\)/);
  assert.match(component, /onClick=\{refreshNotifications\}/);
  assert.match(component, /onClick=\{\(\) => markOneRead\(notification\.id\)\}/);
  assert.match(component, /onClick=\{\(\) => setOpen\(false\)\}/);
  assert.doesNotMatch(component, /stopPropagation\(|preventDefault\(/);
});

// web/test/notifications.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyReceived } from "../src/lib/notifications";

class FakeNotification {
  static permission: NotificationPermission = "granted";
  static instances: Array<{ title: string; options?: NotificationOptions }> = [];
  constructor(title: string, options?: NotificationOptions) {
    FakeNotification.instances.push({ title, options });
  }
}

describe("notifyReceived", () => {
  beforeEach(() => {
    FakeNotification.instances = [];
    FakeNotification.permission = "granted";
    vi.stubGlobal("Notification", FakeNotification);
  });

  it("does not create a Notification when the tab is visible", () => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });

    notifyReceived("Test", "body");

    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("creates a Notification when the tab is hidden and permission is granted", () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });

    notifyReceived("Test", "body");

    expect(FakeNotification.instances).toEqual([{ title: "Test", options: { body: "body" } }]);
  });
});

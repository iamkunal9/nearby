import { describe, it, expect } from "vitest";
import { roomKeyForIp } from "../src/index";

describe("roomKeyForIp", () => {
  it("returns the full address for IPv4", () => {
    expect(roomKeyForIp("203.0.113.5")).toBe("203.0.113.5");
  });

  it("groups two IPv6 addresses on the same /64 into the same key", () => {
    const deviceA = roomKeyForIp("2405:201:5c10:20ba:b5b1:13ba:23a9:4ae5");
    const deviceB = roomKeyForIp("2405:201:5c10:20ba:9d56:353:1755:7791");
    expect(deviceA).toBe(deviceB);
  });

  it("keeps different /64 prefixes distinct", () => {
    const deviceA = roomKeyForIp("2405:201:5c10:20ba:b5b1:13ba:23a9:4ae5");
    const deviceC = roomKeyForIp("2001:db8:aaaa:bbbb:1111:2222:3333:4444");
    expect(deviceA).not.toBe(deviceC);
  });

  it("expands :: compression before taking the /64 prefix", () => {
    expect(roomKeyForIp("2405:201:5c10:20ba::1")).toBe("2405:201:5c10:20ba");
    expect(roomKeyForIp("::1")).toBe("0:0:0:0");
  });
});

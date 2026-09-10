import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nextWheelScale,
  readSavedScale,
  saveScale,
  scaleStorageKey,
} from "../src/renderer/src/hooks/canvas/live2d-scale.ts";

test("wheel zoom accumulates, stays bounded, and persists per model and mode", () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  const pet = scaleStorageKey("kaguya.model3.json", "pet");
  const normal = scaleStorageKey("kaguya.model3.json", "window");
  const other = scaleStorageKey("baoqiao.model3.json", "pet");
  try {
    let target = 1;
    for (let tick = 0; tick < 4; tick += 1) target = nextWheelScale(target, -100);
    assert.ok(Math.abs(target - 1.36) < 1e-10);
    assert.equal(nextWheelScale(target, 0), target);
    assert.equal(nextWheelScale(5, -100), 5);
    assert.equal(nextWheelScale(0.1, 100), 0.1);
    saveScale(pet, target);
    assert.equal(readSavedScale(pet, 0.5), target);
    assert.equal(readSavedScale(normal, 0.5), 0.5);
    assert.equal(readSavedScale(other, 0.8), 0.8);
    for (const invalid of ["broken", "null", '"2"', "1e400"]) {
      values.set(pet, invalid);
      assert.equal(readSavedScale(pet, 0.5), 0.5);
    }
    Object.defineProperty(window, "localStorage", {
      get() { throw new Error("storage unavailable"); },
    });
    assert.equal(readSavedScale(pet, 0.5), 0.5);
    assert.doesNotThrow(() => saveScale(pet, 1.5));
  } finally {
    delete globalThis.window;
  }
});

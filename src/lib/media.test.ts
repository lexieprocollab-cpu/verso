import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createYouTubeMedia, isYouTubeId } from "./media";

// Just enough of the browser for the YouTube adapter (tests run in Node).
class FakeElement {
  children: unknown[] = [];
  get childElementCount() {
    return this.children.length;
  }
  replaceChildren(...nodes: unknown[]) {
    this.children = nodes;
  }
}
beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: "http://verso.test" } });
  vi.stubGlobal("document", { createElement: () => new FakeElement() });
});

type Options = { events: { onReady: () => void; onStateChange: (e: { data: number }) => void } };

describe("YouTube media", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts only real video ids", () => {
    expect(isYouTubeId("dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeId("javascript:alert(1)")).toBe(false);
    expect(isYouTubeId("short")).toBe(false);
  });

  it("queues commands until the player is ready, then follows the player", async () => {
    const calls: string[] = [];
    let options!: Options;
    let current = 0;
    window.YT = {
      Player: class {
        constructor(_el: HTMLElement, o: Options) {
          options = o;
        }
        playVideo = () => calls.push("play");
        pauseVideo = () => calls.push("pause");
        seekTo = (t: number) => {
          calls.push(`seek ${t}`);
          current = t;
        };
        getCurrentTime = () => current;
        getDuration = () => 215;
        setPlaybackRate = (r: number) => calls.push(`rate ${r}`);
        destroy = () => calls.push("destroy");
      } as never,
    };
    const element = new FakeElement() as unknown as HTMLElement;
    const events = { onDuration: vi.fn(), onEnded: vi.fn(), onBlocked: vi.fn() };
    const media = createYouTubeMedia("dQw4w9WgXcQ", element, events);

    media.seek(12);
    media.setRate(0.75);
    await media.play();
    expect(media.time()).toBe(12);
    expect(calls).toEqual([]);

    await Promise.resolve();
    options.events.onReady();
    expect(events.onDuration).toHaveBeenCalledWith(215);
    expect(calls).toEqual(["seek 12", "rate 0.75", "play"]);

    options.events.onStateChange({ data: 0 });
    expect(events.onEnded).toHaveBeenCalled();
    media.destroy();
    expect(calls.at(-1)).toBe("destroy");
    expect(element.childElementCount).toBe(0);
  });
});

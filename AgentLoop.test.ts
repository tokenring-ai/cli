import {describe, expect, it, vi} from "vitest";
import AgentLoop from "./AgentLoop.ts";

function createState(events: any[]) {
  return {
    events,
    * yieldEventsByCursor(cursor: {position: number}) {
      for (; cursor.position < events.length; cursor.position += 1) {
        yield events[cursor.position];
      }
    },
  };
}

describe("AgentLoop", () => {
  it("flashes loop errors and keeps consuming later events", async () => {
    const loop = new AgentLoop({} as any, {
      availableCommands: [],
      config: {} as any,
    });

    const flash = vi.fn();
    const renderEvent = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("bad render");
      })
      .mockImplementation(() => {});
    const syncState = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("bad sync");
      })
      .mockImplementation(() => {});

    (loop as any).ui = {
      flash,
      renderEvent,
      syncState,
    };

    const event1 = {type: "output.info", timestamp: 1, message: "one"};
    const event2 = {type: "output.info", timestamp: 2, message: "two"};

    await (loop as any).consumeEvents(
      (async function* () {
        yield createState([event1]);
        yield createState([event1, event2]);
      })(),
      new AbortController().signal,
    );

    expect(renderEvent).toHaveBeenCalledTimes(2);
    expect(syncState).toHaveBeenCalledTimes(2);
    expect(flash).toHaveBeenCalledWith(
      "Failed to render event: bad render",
      "error",
      10_000,
    );
    expect(flash).toHaveBeenCalledWith(
      "Failed to sync agent state: bad sync",
      "error",
      10_000,
    );
  });
});

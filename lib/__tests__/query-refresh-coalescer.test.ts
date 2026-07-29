import type { QueryClient } from "@tanstack/react-query";
import {
  scheduleCoalescedTask,
  scheduleQueryInvalidation,
} from "../query-refresh-coalescer";

describe("query refresh coalescer", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("colapsa invalidaciones iguales en una sola revalidación autoritativa", () => {
    const invalidateQueries = jest.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    scheduleQueryInvalidation(queryClient, ["movements"]);
    scheduleQueryInvalidation(queryClient, ["movements"]);
    jest.advanceTimersByTime(199);
    expect(invalidateQueries).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["movements"] });
  });

  it("mantiene separadas raíces distintas", () => {
    const invalidateQueries = jest.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    scheduleQueryInvalidation(queryClient, ["movements"]);
    scheduleQueryInvalidation(queryClient, ["workspace-snapshot"]);
    jest.advanceTimersByTime(200);

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });

  it("ejecuta una sola vez la última tarea de una ráfaga", () => {
    const owner = {};
    const first = jest.fn();
    const latest = jest.fn();

    scheduleCoalescedTask(owner, "snapshot:1", first);
    scheduleCoalescedTask(owner, "snapshot:1", latest);
    jest.advanceTimersByTime(200);

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });
});

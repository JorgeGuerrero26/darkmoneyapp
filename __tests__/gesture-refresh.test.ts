const React = require("react");
const { act, create } = require("react-test-renderer");
import { useGestureRefresh } from "../hooks/useGestureRefresh";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useGestureRefresh", () => {
  let root: any;
  let refresh: ReturnType<typeof useGestureRefresh>;

  function mount(onRefresh: () => Promise<void>) {
    function Harness() {
      refresh = useGestureRefresh(onRefresh);
      return null;
    }
    act(() => { root = create(React.createElement(Harness)); });
  }

  afterEach(() => {
    if (root) act(() => root.unmount());
    root = undefined;
    jest.useRealTimers();
  });

  it("stays hidden until a gesture and closes when the refresh completes", async () => {
    const request = deferred();
    const onRefresh = jest.fn(() => request.promise);
    mount(onRefresh);
    expect(refresh.refreshing).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();

    act(() => refresh.refreshByGesture());
    expect(refresh.refreshing).toBe(true);
    await act(async () => { await Promise.resolve(); });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(refresh.refreshing).toBe(true);

    await act(async () => { request.resolve(); await request.promise; });
    expect(refresh.refreshing).toBe(false);
  });

  it("closes a stalled indicator without letting the old request close a new gesture", async () => {
    jest.useFakeTimers();
    const first = deferred();
    const second = deferred();
    const onRefresh = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mount(onRefresh);

    act(() => refresh.refreshByGesture());
    await act(async () => { await Promise.resolve(); });
    act(() => jest.advanceTimersByTime(15_000));
    expect(refresh.refreshing).toBe(false);

    act(() => refresh.refreshByGesture());
    await act(async () => { await Promise.resolve(); });
    expect(refresh.refreshing).toBe(true);
    await act(async () => { first.resolve(); await first.promise; });
    expect(refresh.refreshing).toBe(true);
    await act(async () => { second.resolve(); await second.promise; });
    expect(refresh.refreshing).toBe(false);
  });
});

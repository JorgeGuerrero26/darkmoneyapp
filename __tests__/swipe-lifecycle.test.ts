const React = require('react');
const { create, act } = require('react-test-renderer');
import { View, SectionList, AppState } from 'react-native';
import { SwipeActionRow } from '../components/ui/SwipeActionRow';
import { SwipeRowContext } from '../components/ui/SwipeRowScope';
import { ResourceSectionList } from '../components/ui/ResourceSectionList';

const mockReactions = new Set<any>();
jest.mock('@react-navigation/native', () => ({ NavigationContext: require('react').createContext(null) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Warning: 'warning' },
}));
jest.mock('react-native-gesture-handler', () => {
  function gesture(kind: string) {
    const result: any = { kind, handlers: {} };
    ['enabled', 'activeOffsetX', 'failOffsetY', 'maxPointers'].forEach(key => {
      result[key] = jest.fn(() => result);
    });
    ['onBegin', 'onStart', 'onUpdate', 'onEnd', 'onFinalize', 'onTouchesDown'].forEach(key => {
      result[key] = (callback: any) => { result.handlers[key] = callback; return result; };
    });
    return result;
  }
  return { Gesture: { Pan: () => gesture('pan'), Tap: () => gesture('tap') }, GestureDetector: 'GestureDetector' };
});
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  return {
    __esModule: true, default: { View: 'AnimatedView' },
    useSharedValue: (value: any) => React.useRef({ value }).current,
    useAnimatedStyle: (read: any) => ({ read }),
    useAnimatedReaction: (prepare: any, react: any) => {
      React.useEffect(() => {
        const entry = { prepare, react, previous: null };
        mockReactions.add(entry);
        return () => mockReactions.delete(entry);
      }, [prepare, react]);
    },
    cancelAnimation: jest.fn(), withSpring: (target: number) => target,
    runOnJS: (fn: any) => fn, runOnUI: (fn: any) => fn,
    interpolate: () => 0, Extrapolation: { CLAMP: 'clamp' },
  };
});

function flushReactions() {
  for (const reaction of mockReactions) {
    const next = reaction.prepare();
    if (JSON.stringify(next) !== JSON.stringify(reaction.previous)) reaction.react(next, reaction.previous);
    reaction.previous = next;
  }
}
const roots: any[] = [];
function mount(element: any) {
  let root: any;
  act(() => { root = create(element); });
  roots.push(root);
  flushReactions();
  return root;
}
function row(onPress = jest.fn(), key = 'a') {
  return React.createElement(SwipeActionRow, {
    key, leftAction: { label: 'Copy', icon: () => null, onPress: jest.fn() },
    rightAction: { label: 'Delete', icon: () => null, onPress },
    children: React.createElement(View),
  });
}
function pans(root: any) {
  return root.root.findAll((node: any) => node.type === 'GestureDetector' && node.props.gesture.kind === 'pan');
}
function position(pan: any) {
  const content = pan.findAll((node: any) => node.type === 'AnimatedView')
    .find((node: any) => node.props.collapsable === false);
  return content.props.style[1].read().transform[0].translateX;
}
function begin(pan: any, dx = -70) {
  pan.props.gesture.handlers.onBegin();
  flushReactions();
  pan.props.gesture.handlers.onStart();
  pan.props.gesture.handlers.onUpdate({ translationX: dx });
}
function release(pan: any, dx = -70, success = true) {
  pan.props.gesture.handlers.onEnd({ translationX: dx, velocityX: 0 }, success);
  pan.props.gesture.handlers.onFinalize({}, success);
}
afterEach(() => {
  act(() => roots.splice(0).forEach(root => root.unmount()));
  jest.restoreAllMocks();
});

describe('swipe gesture lifecycle (native delivery mocked)', () => {
  it('closes a cancelled drag and accepts a fresh gesture', () => {
    const pan = pans(mount(row()))[0];
    begin(pan); expect(position(pan)).toBe(-70);
    release(pan, -70, false); expect(position(pan)).toBe(0);
    begin(pan); release(pan); expect(position(pan)).toBe(-90);
  });
  it('also recovers when finalization arrives without a release callback', () => {
    const pan = pans(mount(row()))[0];
    begin(pan);
    pan.props.gesture.handlers.onFinalize({}, false);
    expect(position(pan)).toBe(0);
  });
  it('closes when an action disappears and preserves the latest action callback on rerender', () => {
    const original = jest.fn(); const latest = jest.fn();
    const root = mount(row(original));
    begin(pans(root)[0]); release(pans(root)[0]);
    act(() => root.update(row(latest)));
    expect(position(pans(root)[0])).toBe(-90);
    root.root.findAll((node: any) => node.props.accessibilityLabel === 'Delete' && typeof node.props.onPress === 'function')[0].props.onPress();
    expect(original).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledTimes(1);
    begin(pans(root)[0]); release(pans(root)[0]);
    act(() => root.update(React.createElement(SwipeActionRow, { key: 'a', children: React.createElement(View) })));
    expect(position(pans(root)[0])).toBe(0);
  });
  it('only moves the touched row; touching a second row closes the first', () => {
    const scope = { owner: { value: null }, revision: { value: 0 } };
    const root = mount(React.createElement(SwipeRowContext.Provider, { value: scope }, [row(undefined, 'a'), row(undefined, 'b')]));
    const [first, second] = pans(root);
    begin(first); release(first);
    begin(second, 60);
    expect(position(first)).toBe(0);
    expect(position(second)).toBe(60);
    first.props.gesture.handlers.onUpdate({ translationX: -80 });
    expect(position(first)).toBe(0);
  });
  it('rejects late updates and releases after scroll or blur resets ownership', () => {
    const scope = { owner: { value: null }, revision: { value: 0 } };
    const pan = pans(mount(React.createElement(SwipeRowContext.Provider, { value: scope }, row())))[0];
    begin(pan);
    scope.revision.value += 1; scope.owner.value = null; flushReactions();
    pan.props.gesture.handlers.onUpdate({ translationX: -90 });
    release(pan);
    expect(position(pan)).toBe(0);
  });
  it('clamps travel and closes instead of jumping to the opposite action', () => {
    const pan = pans(mount(row()))[0];
    begin(pan, -400); expect(position(pan)).toBe(-90); release(pan, -400);
    begin(pan, 25);
    pan.props.gesture.handlers.onEnd({ translationX: 25, velocityX: 1200 }, true);
    expect(position(pan)).toBe(0);
  });
  it('cancels an active gesture when a second finger touches it', () => {
    const pan = pans(mount(row()))[0];
    begin(pan);
    const fail = jest.fn();
    pan.props.gesture.handlers.onTouchesDown({ numberOfTouches: 2 }, { fail });
    release(pan);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(position(pan)).toBe(0);
  });
  it('runs an action once without waiting for the closing animation', () => {
    const action = jest.fn();
    const root = mount(row(action)); const pan = pans(root)[0];
    const press = root.root.findAll((node: any) => node.props.accessibilityLabel === 'Delete' && typeof node.props.onPress === 'function')[0].props.onPress;
    press(); expect(action).not.toHaveBeenCalled();
    begin(pan); release(pan);
    press(); press(); expect(action).toHaveBeenCalledTimes(1);
    expect(position(pan)).toBe(0);
  });
  it('lets closed-row taps reach children and consumes taps on open content', () => {
    const root = mount(row()); const pan = pans(root)[0];
    const tap = root.root.findAll((node: any) => node.type === 'GestureDetector' && node.props.gesture.kind === 'tap')[0];
    const fail = jest.fn(); tap.props.gesture.handlers.onTouchesDown({}, { fail });
    expect(fail).toHaveBeenCalledTimes(1);
    begin(pan); release(pan);
    tap.props.gesture.handlers.onEnd({}, true);
    expect(position(pan)).toBe(0);
  });
});

describe('resource list row identity', () => {
  it('preserves a mounted row when the entrance deadline passes and data reorders', () => {
    let mounts = 0;
    function Content() { React.useEffect(() => { mounts++; }, []); return React.createElement(View); }
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const props = {
      sections: [], renderItem: () => React.createElement(Content), keyExtractor: () => 'a',
      loading: { isLoading: false }, empty: null,
    };
    const list = mount(React.createElement(ResourceSectionList, props));
    const info: any = { item: { id: 'a' }, index: 0, section: {} };
    const render = () => list.root.findByType(SectionList).props.renderItem(info);
    const cell = mount(render());
    clock.mockReturnValue(3000); info.index = 4;
    act(() => { list.update(React.createElement(ResourceSectionList, { ...props, sections: [] })); });
    act(() => cell.update(render()));
    expect(mounts).toBe(1);
    expect(list.root.findByType(SectionList).props.removeClippedSubviews).toBe(false);
  });
  it('invalidates list gestures on scrolling and app backgrounding', () => {
    let appStateChange: any;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateChange = listener; return { remove: jest.fn() };
    });
    let scope: any;
    function Probe() { scope = React.useContext(SwipeRowContext); return null; }
    const list = mount(React.createElement(ResourceSectionList, {
      sections: [], renderItem: () => null, keyExtractor: () => 'a',
      loading: { isLoading: false }, empty: null, listHeaderComponent: React.createElement(Probe),
    }));
    scope.owner.value = 'row';
    list.root.findByType(SectionList).props.onScrollBeginDrag();
    expect(scope.owner.value).toBe(null); expect(scope.revision.value).toBe(1);
    scope.owner.value = 'row'; appStateChange('background');
    expect(scope.owner.value).toBe(null); expect(scope.revision.value).toBe(2);
  });
  it('invalidates on navigation blur and removes its listener on unmount', () => {
    const { NavigationContext } = require('@react-navigation/native');
    let blur: any; let scope: any;
    const unsubscribe = jest.fn();
    const navigation = { addListener: jest.fn((_event, callback) => { blur = callback; return unsubscribe; }) };
    function Probe() { scope = React.useContext(SwipeRowContext); return null; }
    const root = mount(React.createElement(NavigationContext.Provider, { value: navigation },
      React.createElement(ResourceSectionList, {
        sections: [], renderItem: () => null, keyExtractor: () => 'a',
        loading: { isLoading: false }, empty: null, listHeaderComponent: React.createElement(Probe),
      })));
    scope.owner.value = 'row'; blur();
    expect(scope.owner.value).toBe(null); expect(scope.revision.value).toBe(1);
    act(() => root.unmount());
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

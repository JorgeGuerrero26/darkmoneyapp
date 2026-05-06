---
name: darkmoney-origin-back-navigation
description: Use this skill when creating, reviewing, or fixing DarkMoney module back navigation. Ensure modules return to the real origin screen such as More, dashboard, notifications, or previous flow, and not always to dashboard. Covers header back, Android BackHandler, iOS/React Navigation beforeRemove, route origin params, and useOriginBackNavigation.
---

# DarkMoney Origin Back Navigation

Use this skill whenever a module or screen needs standardized back navigation UX.

## Goal

DarkMoney modules must return to the screen they were opened from.

Do not assume dashboard is the correct back destination.

Possible origins:

- More.
- Dashboard.
- Notifications.
- Search.
- Another module.
- Deep link.
- Internal flow.
- Previous stack screen.

## Source Of Truth

Use the existing centralized hook when available:

```ts
useOriginBackNavigation
```

Do not duplicate back-navigation logic in every module unless the project has no central helper.

If the hook is incomplete, propose extending the hook instead of adding local one-off fixes.

## Workflow

1. Identify the route file under `app/`.
2. Identify how the module is opened.
3. Identify possible origins.
4. Check whether the navigation call passes an origin parameter such as `from`.
5. Check whether the screen uses `useOriginBackNavigation`.
6. Check whether header back, Android system back, and iOS/React Navigation back are covered.
7. Preserve normal stack behavior when no origin is present.
8. Avoid hardcoded dashboard fallback unless it is explicitly the final safe fallback.
9. Validate with typecheck and diff check.

## Route Origin Pattern

When a module is opened from More, pass:

```ts
?from=more
```

Example:

```ts
router.push('/subscriptions?from=more')
```

For other origins, use a clear value:

```ts
?from=dashboard
?from=notifications
?from=search
```

If future project conventions use `returnTo` or another param, keep the logic centralized in the navigation hook.

## Header Back

The header back button must use the origin-aware handler.

Preferred pattern:

```ts
const { handleBack } = useOriginBackNavigation();
```

Then pass `handleBack` to the header back action.

Do not use direct `router.back()` in origin-aware module screens.

## Android Back Gesture / Hardware Back

Android system back gesture and physical back button require `BackHandler`.

The central hook should cover:

```ts
BackHandler.addEventListener('hardwareBackPress', () => {
  if (!from) return false;
  handleBack();
  return true;
});
```

Rules:

- Return `true` when the event is handled.
- Return `false` when there is no origin and default behavior should continue.
- Clean up the listener on unmount or dependency change.
- Do not rely only on `beforeRemove` for Android.

## iOS / React Navigation Back

For React Navigation back events, the central hook may need:

```ts
navigation.addListener('beforeRemove', ...)
```

Rules:

- If `from` exists, prevent default navigation.
- Execute the same `handleBack()`.
- If `from` does not exist, allow default navigation.
- Clean up listener on unmount.

## New Module Checklist

When creating a new module:

- Determine from where the module can be opened.
- If opened from `More`, use `?from=more`.
- If opened from dashboard or another module, pass the correct origin.
- Use `useOriginBackNavigation`.
- Do not use `router.back()` directly.
- Do not hardcode dashboard as the destination.
- If opened from `More`, register the hidden screen in `app/(app)/_layout.tsx` with `href: null` when this matches the project pattern.
- Validate both header back and Android system back.

## Audit Checklist

Check for:

- `router.back()` direct usage.
- `router.replace('/dashboard')` or equivalent hardcoded fallback.
- Missing `from` param.
- Missing `useOriginBackNavigation`.
- Missing `BackHandler` coverage.
- `beforeRemove` used without Android `BackHandler`.
- Missing cleanup of listeners.
- Module opened from More without `?from=more`.
- Screen not registered as hidden route when needed.

## Validation

Run:

```bash
npm run typecheck
git diff --check
```

Run `npm run lint` only if the environment has a valid ESLint configuration.

## Manual Testing

Test on Android real device or emulator:

1. Open module from More.
2. Tap header back.
3. Confirm it returns to More.
4. Open module again from More.
5. Use Android system back gesture or hardware back.
6. Confirm it returns to More, not dashboard.

Test additional origins when applicable:

- Dashboard.
- Notifications.
- Search.
- Another module.

## Final Response

Include:

- Files changed.
- Origin paths supported.
- Whether header back is covered.
- Whether Android BackHandler is covered.
- Whether iOS/React Navigation beforeRemove is covered.
- Validation commands and results.
- Manual tests still needed.
- Risks or assumptions.
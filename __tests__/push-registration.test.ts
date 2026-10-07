import { classifyPushRegistrationError } from "../lib/push-registration-errors";
import { registerForPushNotifications, savePushTokenToSupabase, refreshEnabledPushToken } from "../services/push-registration";
import { Platform } from "react-native";

const mockNotifications = {
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
};
const mockUpsert = jest.fn();
const mockReadPreference = jest.fn();
const mockUpdateActive = jest.fn();
const mockUpdateUser = jest.fn(() => ({ eq: mockUpdateActive }));
const mockUpdate = jest.fn(() => ({ eq: mockUpdateUser }));
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { executionEnvironment: "standalone", easConfig: { projectId: "test-project" } },
}));
jest.mock("../lib/notifications-runtime", () => ({ getNotificationsModule: () => mockNotifications }));
jest.mock("../lib/supabase", () => ({ supabase: { from: () => ({
  upsert: mockUpsert,
  select: () => ({ eq: () => ({ maybeSingle: mockReadPreference }) }),
  update: mockUpdate,
}) } }));
jest.mock("../lib/error-logger", () => ({ logWarn: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(Platform, { OS: "ios" });
  mockNotifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
  mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
  mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: "test-token" });
  mockUpsert.mockResolvedValue({ error: null });
  mockReadPreference.mockResolvedValue({ data: { is_active: true }, error: null });
  mockUpdateActive.mockResolvedValue({ error: null });
});

test("missing iOS signing entitlement is not reported as an internet failure", async () => {
  mockNotifications.getExpoPushTokenAsync.mockRejectedValue(new Error(
    'Notification registration failed: No valid "aps-environment" entitlement string found for application',
  ));
  expect(await registerForPushNotifications()).toMatchObject({ ok: false, reason: "native_configuration" });
});

test("Expo server errors mentioning fetching are not classified as offline", () => {
  const error = Object.assign(new Error("Error encountered while fetching Expo token: 503"), {
    code: "ERR_NOTIFICATIONS_SERVER_ERROR",
  });
  expect(classifyPushRegistrationError(error).reason).toBe("service_error");
});

test("only identified transport failures report a connection problem", () => {
  expect(classifyPushRegistrationError(Object.assign(new Error("Expo request failed"), {
    code: "ERR_NOTIFICATIONS_NETWORK_ERROR",
  })).reason).toBe("network_error");
  expect(classifyPushRegistrationError(new Error("Registration rejected by device")).reason).toBe("registration_error");
});

test("permission API exceptions are caught and denial does not request a token", async () => {
  mockNotifications.getPermissionsAsync.mockRejectedValueOnce(new Error("Native permission failure"));
  expect(await registerForPushNotifications()).toMatchObject({ ok: false, reason: "registration_error" });
  mockNotifications.getPermissionsAsync.mockResolvedValueOnce({ status: "denied" });
  mockNotifications.requestPermissionsAsync.mockResolvedValueOnce({ status: "denied" });
  expect(await registerForPushNotifications()).toMatchObject({ ok: false, reason: "permissions_denied" });
  expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
});

test("bootstrap and Settings share one registration while it is pending", async () => {
  let finish!: (value: { data: string }) => void;
  mockNotifications.getExpoPushTokenAsync.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const bootstrap = registerForPushNotifications();
  const settings = registerForPushNotifications();
  expect(settings).toBe(bootstrap);
  await Promise.resolve();
  finish({ data: "shared-token" });
  expect(await settings).toEqual({ ok: true, token: "shared-token" });
  expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
  expect(await registerForPushNotifications()).toEqual({ ok: true, token: "test-token" });
});

test("stalled token registration times out, ignores late success and allows another attempt", async () => {
  jest.useFakeTimers();
  try {
    let finish!: (value: { data: string }) => void;
    mockNotifications.getExpoPushTokenAsync.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = registerForPushNotifications();
    await jest.advanceTimersByTimeAsync(25_000);
    expect(await pending).toMatchObject({ ok: false, reason: "timeout" });
    finish({ data: "late-token" });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(await registerForPushNotifications()).toEqual({ ok: true, token: "test-token" });
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test("a rejected database write cannot be treated as successful activation", async () => {
  const error = { code: "42501", message: "Write denied" };
  mockUpsert.mockResolvedValueOnce({ error });
  await expect(savePushTokenToSupabase("user", "test-token")).rejects.toEqual(error);
  await expect(savePushTokenToSupabase("user", "test-token")).resolves.toBeUndefined();
});

test("Android creates its channel before requesting permissions and catches channel failures", async () => {
  Object.assign(Platform, { OS: "android" });
  mockNotifications.setNotificationChannelAsync.mockRejectedValueOnce(new Error("Native channel failure"));
  expect(await registerForPushNotifications()).toMatchObject({ ok: false, reason: "registration_error" });
  expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
  expect(await registerForPushNotifications()).toEqual({ ok: true, token: "test-token" });
  expect(mockNotifications.setNotificationChannelAsync.mock.invocationCallOrder[1])
    .toBeLessThan(mockNotifications.getPermissionsAsync.mock.invocationCallOrder[0]);
});

test("the token timeout does not interrupt a user's permission decision", async () => {
  jest.useFakeTimers();
  try {
    let finish!: (value: { status: string }) => void;
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({ status: "undetermined" });
    mockNotifications.requestPermissionsAsync.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = registerForPushNotifications();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    finish({ status: "granted" });
    expect(await pending).toEqual({ ok: true, token: "test-token" });
  } finally {
    jest.useRealTimers();
  }
});

test.each([null, { is_active: false }])("startup does not enable push for preference %p", async (data) => {
  mockReadPreference.mockResolvedValueOnce({ data, error: null });
  await refreshEnabledPushToken("user", () => false);
  expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockUpsert).not.toHaveBeenCalled();
});

test("startup refresh only updates the token of a device that is still enabled", async () => {
  await refreshEnabledPushToken("user", () => false);
  expect(mockUpdate).toHaveBeenCalledWith({ push_token: "test-token", platform: "ios" });
  expect(mockUpdateUser).toHaveBeenCalledWith("user_id", "user");
  expect(mockUpdateActive).toHaveBeenCalledWith("is_active", true);
  expect(mockUpsert).not.toHaveBeenCalled();
});

test("startup leaves preferences untouched after the hook unmounts", async () => {
  let cancelled = false;
  let finish!: (value: { data: string }) => void;
  mockNotifications.getExpoPushTokenAsync.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const pending = refreshEnabledPushToken("user", () => cancelled);
  await Promise.resolve();
  await Promise.resolve();
  cancelled = true;
  finish({ data: "test-token" });
  await pending;
  expect(mockUpdate).not.toHaveBeenCalled();
});

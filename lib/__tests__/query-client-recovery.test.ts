import { isAuthLikeError } from "../auth-error";

describe("isAuthLikeError", () => {
  it("flags stale-session / auth errors that warrant a session recovery", () => {
    expect(isAuthLikeError('42501 | new row violates row-level security policy for table "movements"')).toBe(true);
    expect(isAuthLikeError("JWT expired")).toBe(true);
    expect(isAuthLikeError("Invalid Refresh Token")).toBe(true);
    expect(isAuthLikeError("Request failed with status 401")).toBe(true);
    expect(isAuthLikeError("403 Forbidden")).toBe(true);
    expect(isAuthLikeError("User not authenticated")).toBe(true);
  });

  it("does NOT flag plain network failures (handled by onlineManager, not a token refresh)", () => {
    expect(isAuthLikeError("TypeError: Network request failed")).toBe(false);
    expect(isAuthLikeError("Timeout (20000ms) at list-shared-obligations")).toBe(false);
    expect(isAuthLikeError("")).toBe(false);
  });
});

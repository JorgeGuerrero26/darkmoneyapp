import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCOUNTS_DISPLAY_CURRENCY_KEY = "darkmoney.accounts.displayCurrency";

type DisplayCurrencyContextValue = {
  /** `null` while the persisted preference is being read. Consumers must fallback to base. */
  displayCurrency: string | null;
  /** Persists and updates the preference. Uppercases the code. */
  setDisplayCurrency: (code: string) => void;
};

const DisplayCurrencyContext = createContext<DisplayCurrencyContextValue | null>(null);

/**
 * Provider for the user-selected "show all account balances in this currency"
 * preference. Backed by AsyncStorage so it persists across launches. Scope is
 * accounts list + account detail today; dashboard can opt-in later by wrapping
 * its tree with this provider (or by hoisting the provider further up).
 */
export function DisplayCurrencyProvider({ children }: PropsWithChildren) {
  const [displayCurrency, setDisplayCurrencyState] = useState<string | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(ACCOUNTS_DISPLAY_CURRENCY_KEY).then((stored) => {
      setDisplayCurrencyState(stored ? stored.toUpperCase() : null);
    });
  }, []);

  const setDisplayCurrency = useCallback((code: string) => {
    const next = code.toUpperCase();
    setDisplayCurrencyState(next);
    void AsyncStorage.setItem(ACCOUNTS_DISPLAY_CURRENCY_KEY, next);
  }, []);

  return (
    <DisplayCurrencyContext.Provider value={{ displayCurrency, setDisplayCurrency }}>
      {children}
    </DisplayCurrencyContext.Provider>
  );
}

/**
 * Read the shared "display currency" preference. Returns `null` until the
 * persisted value has been loaded — callers should fall back to the workspace
 * base currency in that case.
 *
 * Throws if used outside of `DisplayCurrencyProvider`, since silent-fallback
 * would hide the real bug of forgetting to wrap the tree.
 */
export function useDisplayCurrency(): DisplayCurrencyContextValue {
  const ctx = useContext(DisplayCurrencyContext);
  if (!ctx) {
    throw new Error("useDisplayCurrency must be used inside DisplayCurrencyProvider");
  }
  return ctx;
}

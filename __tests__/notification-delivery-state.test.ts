import { notificationDeliveryState } from "../lib/notification-delivery-state";

const enabledPreferences = {
  pushEnabled: true, pushToken: "test-token", dailyDigestEnabled: true, predictiveAlertsEnabled: true,
};

test.each([undefined, { ...enabledPreferences, pushEnabled: false }, { ...enabledPreferences, pushToken: null }, { ...enabledPreferences, pushToken: " " }])(
  "saved topic preferences cannot show as active without usable push: %p", (preferences) => {
    expect(notificationDeliveryState(preferences)).toEqual({
      pushReady: false, dailyDigestActive: false, predictiveAlertsActive: false,
    });
  },
);

test("enabling push restores topic choices independently", () => {
  expect(notificationDeliveryState({ ...enabledPreferences, dailyDigestEnabled: false })).toEqual({
    pushReady: true, dailyDigestActive: false, predictiveAlertsActive: true,
  });
  expect(notificationDeliveryState({ ...enabledPreferences, predictiveAlertsEnabled: false })).toEqual({
    pushReady: true, dailyDigestActive: true, predictiveAlertsActive: false,
  });
});

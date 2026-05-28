import { resolveDashboardEntitlement } from "../../features/dashboard/lib/entitlement-resolver";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runFreeDefault() {
  const result = resolveDashboardEntitlement({
    proAccessEnabled: false,
    hasGift: false,
    isAdmin: false,
    isLoading: false,
  });
  assert(result.tier === "free", `tier esperado free, recibido ${result.tier}`);
  assert(result.reason === "free_default", `reason esperado free_default, recibido ${result.reason}`);
  assert(result.features.advancedDashboard === false, "advancedDashboard debe ser false");
  assert(result.features.aiInsights === false, "aiInsights debe ser false");
  assert(result.features.unlimitedAiUsage === false, "unlimitedAiUsage debe ser false");
}

function runProSubscription() {
  const result = resolveDashboardEntitlement({
    proAccessEnabled: true,
    hasGift: false,
    isAdmin: false,
    isLoading: false,
  });
  assert(result.tier === "pro", `tier esperado pro, recibido ${result.tier}`);
  assert(result.reason === "pro_subscription", `reason esperado pro_subscription, recibido ${result.reason}`);
  assert(result.features.advancedDashboard === true, "advancedDashboard debe ser true");
  assert(result.features.aiInsights === true, "aiInsights debe ser true");
  assert(result.features.unlimitedAiUsage === false, "Pro sin admin: unlimitedAiUsage debe ser false");
}

function runGiftEmail() {
  const result = resolveDashboardEntitlement({
    proAccessEnabled: false,
    hasGift: true,
    isAdmin: false,
    isLoading: false,
  });
  assert(result.tier === "pro", "gift email debe dar tier pro");
  assert(result.reason === "gift_email", `reason esperado gift_email, recibido ${result.reason}`);
  assert(result.features.advancedDashboard === true, "advancedDashboard debe ser true para gift");
  assert(result.features.unlimitedAiUsage === false, "gift sin admin: unlimitedAiUsage debe ser false");
}

function runAdminEmail() {
  const result = resolveDashboardEntitlement({
    proAccessEnabled: false,
    hasGift: false,
    isAdmin: true,
    isLoading: false,
  });
  assert(result.tier === "pro", "admin email debe dar tier pro");
  assert(result.reason === "admin_email", `reason esperado admin_email, recibido ${result.reason}`);
  assert(result.features.advancedDashboard === true, "advancedDashboard debe ser true para admin");
  assert(result.features.unlimitedAiUsage === true, "admin debe tener unlimitedAiUsage");
}

function runProTakesPrecedenceOverGift() {
  // Si un usuario tiene Pro Y es gift, gana Pro como reason (subscription real).
  const result = resolveDashboardEntitlement({
    proAccessEnabled: true,
    hasGift: true,
    isAdmin: false,
    isLoading: false,
  });
  assert(result.reason === "pro_subscription", `pro debe ganar sobre gift, recibido ${result.reason}`);
}

function runAdminTakesPrecedenceOverGift() {
  // Admin sobre gift: admin gana porque desbloquea unlimitedAi.
  const result = resolveDashboardEntitlement({
    proAccessEnabled: false,
    hasGift: true,
    isAdmin: true,
    isLoading: false,
  });
  assert(result.reason === "admin_email", `admin debe ganar sobre gift, recibido ${result.reason}`);
  assert(result.features.unlimitedAiUsage === true, "admin debe activar unlimitedAi");
}

function runProTakesPrecedenceOverAdmin() {
  // Pro real (suscripción paga) debe reportarse como pro_subscription, no como admin.
  // Pero admin sigue desbloqueando unlimitedAi.
  const result = resolveDashboardEntitlement({
    proAccessEnabled: true,
    hasGift: false,
    isAdmin: true,
    isLoading: false,
  });
  assert(result.reason === "pro_subscription", `pro debe reportarse como pro_subscription, recibido ${result.reason}`);
  assert(result.features.unlimitedAiUsage === true, "admin debe seguir activando unlimitedAi aunque sea pro");
}

function runLoadingPropagates() {
  const result = resolveDashboardEntitlement({
    proAccessEnabled: false,
    hasGift: false,
    isAdmin: false,
    isLoading: true,
  });
  assert(result.isLoading === true, "isLoading debe propagarse");
}

function main() {
  const tests: Array<[string, () => void]> = [
    ["free default", runFreeDefault],
    ["pro subscription", runProSubscription],
    ["gift email", runGiftEmail],
    ["admin email", runAdminEmail],
    ["pro toma precedencia sobre gift", runProTakesPrecedenceOverGift],
    ["admin toma precedencia sobre gift", runAdminTakesPrecedenceOverGift],
    ["pro+admin reporta pro pero mantiene unlimitedAi", runProTakesPrecedenceOverAdmin],
    ["isLoading se propaga", runLoadingPropagates],
  ];

  let passed = 0;
  let failed = 0;
  for (const [label, fn] of tests) {
    try {
      fn();
      console.log(`  ✓ ${label}`);
      passed++;
    } catch (error) {
      console.error(`  ✗ ${label}: ${(error as Error).message}`);
      failed++;
    }
  }
  console.log(`\nentitlement-smoke: ${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} test(s) failed`);
}

main();

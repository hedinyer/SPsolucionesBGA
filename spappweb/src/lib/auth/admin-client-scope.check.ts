import assert from "node:assert";
import {
  isPostDeliveryCompraEstado,
  referralAllowedForScopedAdmin,
  referralMatchesAdminScope,
  resolveAdminClientReferralScope,
  SCOPED_ADMIN_HIDDEN_QUEUES,
} from "./admin-client-scope.ts";

assert.equal(referralMatchesAdminScope("olga", null), true);
assert.equal(referralMatchesAdminScope("olga", "olga"), true);
assert.equal(referralMatchesAdminScope("fabian", "olga"), false);
assert.equal(referralMatchesAdminScope("guillen", "olga"), false);
assert.equal(referralAllowedForScopedAdmin("guillen", "olga"), true);
assert.equal(referralAllowedForScopedAdmin("fabian", "olga"), false);
assert.equal(referralAllowedForScopedAdmin("guillen", "neisalinas"), true);
assert.equal(referralAllowedForScopedAdmin("guillen", "sebastianbateca"), true);
assert.equal(referralAllowedForScopedAdmin("guillen", "amormio"), true);
assert.equal(referralAllowedForScopedAdmin("guillen", "mauricio"), true);
assert.equal(referralAllowedForScopedAdmin("neisalinas", "neisalinas"), true);

assert.equal(isPostDeliveryCompraEstado("entregada"), true);
assert.equal(isPostDeliveryCompraEstado("saldada"), true);
assert.equal(isPostDeliveryCompraEstado("lista_retiro"), false);
assert.equal(isPostDeliveryCompraEstado("pendiente_pago"), false);

assert.ok(SCOPED_ADMIN_HIDDEN_QUEUES.includes("morosos"));
assert.ok(SCOPED_ADMIN_HIDDEN_QUEUES.includes("recoger"));
assert.ok(!(SCOPED_ADMIN_HIDDEN_QUEUES as readonly string[]).includes("clientes_guillen"));

assert.equal(
  resolveAdminClientReferralScope({
    isLoggedIn: true,
    userId: 2,
    username: "Opinilla",
  }),
  "olga",
);
for (const [userId, username, scope] of [
  [3, "Neisalinas", "neisalinas"],
  [4, "Sebastiánbateca", "sebastianbateca"],
  [5, "amormio", "amormio"],
  [6, "Mauricio", "mauricio"],
] as const) {
  assert.equal(
    resolveAdminClientReferralScope({
      isLoggedIn: true,
      userId,
      username,
    }),
    scope,
  );
}
assert.equal(
  resolveAdminClientReferralScope({
    isLoggedIn: true,
    userId: 1,
    username: "adminBucaramanga",
  }),
  null,
);

console.log("admin-client-scope.check OK");

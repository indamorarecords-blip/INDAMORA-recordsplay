import { shopTest as legacyShop } from "./shop-test";
import { PostgresShopRepository } from "./shop-postgres";

export const persistentShop = new PostgresShopRepository();
export function isPersistentShop() {
  return process.env.NODE_ENV !== "development" || process.env.SHOP_TEST_PERSISTENCE === "postgres";
}
// There is no automatic fallback to TEST files if PostgreSQL/Stripe fail.
// The old files remain untouched as a recovery source.
export const shop = isPersistentShop() ? persistentShop : legacyShop;

import { Braze } from 'capacitor-braze';

/**
 * Typed event helpers used throughout the demo app. Wrapping the raw
 * `logCustomEvent` calls in named functions has two payoffs:
 *
 *   1. Renames stay local — if you decide to rename the `add_to_cart`
 *      event to `cart_item_added`, you change it here, not at 14 call
 *      sites across the app.
 *   2. Property shapes get TypeScript narrowing — `track.purchaseStarted({
 *      cartValue: 'forty' })` fails at compile time.
 *
 * Each helper resolves immediately even on call failure (Braze SDK is
 * fire-and-forget for events); UX never blocks on analytics.
 */
export const track = {
  /** Browse / list view of one of the two top-level verticals. */
  async verticalViewed(vertical: 'restaurants' | 'shop'): Promise<void> {
    await safelyLog('vertical_viewed', { vertical });
  },

  /** Restaurant card opened. */
  async restaurantViewed(args: { restaurantId: string; name: string }): Promise<void> {
    await safelyLog('restaurant_viewed', args);
  },

  /** Menu item detail opened. */
  async menuItemViewed(args: {
    restaurantId: string;
    itemId: string;
    itemName: string;
    priceCents: number;
  }): Promise<void> {
    await safelyLog('menu_item_viewed', args);
  },

  /** Shop product detail opened. */
  async productViewed(args: {
    productId: string;
    productName: string;
    priceCents: number;
    category: string;
  }): Promise<void> {
    await safelyLog('product_viewed', args);
  },

  /** Add-to-cart, fired by both verticals. */
  async addedToCart(args: {
    source: 'restaurant' | 'shop';
    itemId: string;
    itemName: string;
    priceCents: number;
    quantity: number;
  }): Promise<void> {
    await safelyLog('added_to_cart', args);
  },

  /** Checkout flow entered (cart → confirmation). */
  async checkoutStarted(args: { itemCount: number; totalCents: number }): Promise<void> {
    await safelyLog('checkout_started', args);
  },

  /** Promotions tab opened. */
  async promotionsViewed(): Promise<void> {
    await safelyLog('promotions_viewed');
  },

  /** Content card tapped — distinct from impression. */
  async contentCardTapped(args: { cardId: string; cardType: string }): Promise<void> {
    await safelyLog('content_card_tapped', args);
  },
} as const;

/**
 * Wraps `Braze.logCustomEvent` so a failed network call / uninitialized
 * SDK doesn't break the calling component's render. Promise resolves
 * either way; errors are logged at warn level (shape only, no values).
 */
async function safelyLog(name: string, properties?: Record<string, string | number | boolean>): Promise<void> {
  try {
    await Braze.logCustomEvent({ name, properties });
  } catch (err) {
    console.warn(`[demo] logCustomEvent("${name}") failed:`, (err as Error).message);
  }
}

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Cart line item. `source` distinguishes restaurant items from shop
 * products so the checkout screen can render mixed carts cleanly and
 * the purchase event can attribute revenue per vertical.
 */
export interface CartLine {
  id: string;
  source: 'restaurant' | 'shop';
  itemId: string;
  name: string;
  priceCents: number;
  quantity: number;
  /** Optional per-source metadata (e.g. restaurantId, category). */
  metadata?: Record<string, string>;
}

interface CartState {
  lines: CartLine[];
  addLine: (line: Omit<CartLine, 'id'>) => void;
  removeLine: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clear: () => void;
  totalCents: () => number;
  itemCount: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],

      addLine: (line) => {
        set((state) => {
          // Coalesce identical items (same source + itemId) by bumping
          // quantity rather than adding a new line — matches typical
          // ordering UX.
          const existing = state.lines.find((l) => l.source === line.source && l.itemId === line.itemId);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.id === existing.id ? { ...l, quantity: l.quantity + line.quantity } : l,
              ),
            };
          }
          const id = `${line.source}-${line.itemId}-${Date.now()}`;
          return { lines: [...state.lines, { ...line, id }] };
        });
      },

      removeLine: (id) => set((state) => ({ lines: state.lines.filter((l) => l.id !== id) })),

      updateQuantity: (id, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.id !== id)
              : state.lines.map((l) => (l.id === id ? { ...l, quantity } : l)),
        })),

      clear: () => set({ lines: [] }),

      totalCents: () => get().lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0),

      itemCount: () => get().lines.reduce((sum, l) => sum + l.quantity, 0),
    }),
    {
      name: 'demo-cart',
    },
  ),
);

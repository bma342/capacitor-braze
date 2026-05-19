/**
 * Static product catalog for the e-commerce vertical. Same shape as
 * `restaurants.ts` — easy to swap to a real fetch later.
 */

export type ProductCategory = 'apparel' | 'home' | 'accessories' | 'outdoors';

export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  category: ProductCategory;
  imageEmoji: string;
  rating: number;
  inStock: boolean;
}

export const products: Product[] = [
  {
    id: 'p-001',
    name: 'Linen field tote',
    description: 'Heavyweight linen, leather handles, 18L. Made to outlast.',
    priceCents: 8900,
    category: 'accessories',
    imageEmoji: '🛍️',
    rating: 4.6,
    inStock: true,
  },
  {
    id: 'p-002',
    name: 'Ceramic pour-over kit',
    description: 'Two-cup dripper, server, paper filters. Hand-thrown.',
    priceCents: 5400,
    category: 'home',
    imageEmoji: '☕',
    rating: 4.8,
    inStock: true,
  },
  {
    id: 'p-003',
    name: 'Merino crewneck',
    description: 'Mid-weight merino, anti-pill, refined wash. Slate / oat / charcoal.',
    priceCents: 13800,
    category: 'apparel',
    imageEmoji: '👕',
    rating: 4.5,
    inStock: true,
  },
  {
    id: 'p-004',
    name: 'Trail running shorts',
    description: 'Lightweight, zip pocket, internal liner. 5".',
    priceCents: 6800,
    category: 'outdoors',
    imageEmoji: '🩳',
    rating: 4.4,
    inStock: true,
  },
  {
    id: 'p-005',
    name: 'Brass desk lamp',
    description: 'Articulating arm, dimmer switch, marble base.',
    priceCents: 24900,
    category: 'home',
    imageEmoji: '💡',
    rating: 4.9,
    inStock: false,
  },
  {
    id: 'p-006',
    name: 'Daypack 18L',
    description: 'Roll-top closure, padded laptop sleeve, weatherproof.',
    priceCents: 11800,
    category: 'outdoors',
    imageEmoji: '🎒',
    rating: 4.7,
    inStock: true,
  },
];

export function findProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function productsByCategory(category: ProductCategory): Product[] {
  return products.filter((p) => p.category === category);
}

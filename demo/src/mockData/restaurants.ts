/**
 * Static restaurant + menu data for the demo. No backend; the data
 * lives in memory and re-loads on every dev cycle. Switching to a
 * real fetch is a one-file change (`fetch('/api/restaurants')`).
 */

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  imageEmoji: string;
}

export interface Restaurant {
  id: string;
  name: string;
  tagline: string;
  cuisine: string;
  imageEmoji: string;
  rating: number;
  deliveryMinutes: number;
  menu: MenuItem[];
}

export const restaurants: Restaurant[] = [
  {
    id: 'r-001',
    name: 'Olive & Vine',
    tagline: 'Mediterranean classics, scratch-made.',
    cuisine: 'Mediterranean',
    imageEmoji: '🥗',
    rating: 4.7,
    deliveryMinutes: 25,
    menu: [
      {
        id: 'r-001-m-1',
        name: 'Lamb gyro plate',
        description: 'Marinated lamb, tzatziki, warm pita, herbed rice.',
        priceCents: 1495,
        imageEmoji: '🥙',
      },
      {
        id: 'r-001-m-2',
        name: 'Greek salad bowl',
        description: 'Romaine, cucumber, kalamata, feta, oregano-lemon dressing.',
        priceCents: 1195,
        imageEmoji: '🥗',
      },
      {
        id: 'r-001-m-3',
        name: 'Hummus trio',
        description: 'Classic, roasted red pepper, beet — with grilled flatbread.',
        priceCents: 995,
        imageEmoji: '🫓',
      },
    ],
  },
  {
    id: 'r-002',
    name: 'Bao & Bao',
    tagline: 'Steamed buns, dumplings, noodles to-go.',
    cuisine: 'Asian',
    imageEmoji: '🥟',
    rating: 4.5,
    deliveryMinutes: 30,
    menu: [
      {
        id: 'r-002-m-1',
        name: 'Pork belly bao (3 pc)',
        description: 'Braised pork, pickled cucumber, hoisin, scallion.',
        priceCents: 1295,
        imageEmoji: '🥟',
      },
      {
        id: 'r-002-m-2',
        name: 'Dan dan noodles',
        description: 'Sesame chili sauce, ground pork, scallion, peanut crunch.',
        priceCents: 1395,
        imageEmoji: '🍜',
      },
      {
        id: 'r-002-m-3',
        name: 'Veg dumplings (8 pc)',
        description: 'Cabbage, mushroom, ginger — pan-fried.',
        priceCents: 1095,
        imageEmoji: '🥟',
      },
    ],
  },
  {
    id: 'r-003',
    name: 'Ember Pizza',
    tagline: 'Wood-fired, sourdough crust.',
    cuisine: 'Italian',
    imageEmoji: '🍕',
    rating: 4.8,
    deliveryMinutes: 35,
    menu: [
      {
        id: 'r-003-m-1',
        name: 'Margherita',
        description: 'San Marzano, fresh mozzarella, basil, olive oil.',
        priceCents: 1695,
        imageEmoji: '🍕',
      },
      {
        id: 'r-003-m-2',
        name: 'Soppressata',
        description: 'Spicy salami, honey, hot pepper, mozzarella.',
        priceCents: 1895,
        imageEmoji: '🍕',
      },
      {
        id: 'r-003-m-3',
        name: 'Burrata salad',
        description: 'Heirloom tomato, basil, balsamic, sea salt.',
        priceCents: 1395,
        imageEmoji: '🥗',
      },
    ],
  },
];

export function findRestaurant(id: string): Restaurant | undefined {
  return restaurants.find((r) => r.id === id);
}

export function findMenuItem(
  restaurantId: string,
  itemId: string,
): { restaurant: Restaurant; item: MenuItem } | undefined {
  const restaurant = findRestaurant(restaurantId);
  if (!restaurant) return undefined;
  const item = restaurant.menu.find((m) => m.id === itemId);
  if (!item) return undefined;
  return { restaurant, item };
}

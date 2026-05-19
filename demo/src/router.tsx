import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';

import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { RestaurantsPage } from './pages/restaurants/RestaurantsPage';
import { RestaurantDetailPage } from './pages/restaurants/RestaurantDetailPage';
import { MenuItemPage } from './pages/restaurants/MenuItemPage';
import { ShopPage } from './pages/shop/ShopPage';
import { ProductDetailPage } from './pages/shop/ProductDetailPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { PromotionsPage } from './pages/PromotionsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';

/**
 * TanStack Router setup. We use programmatic route definitions (rather
 * than the file-based router plugin's generated tree) because the demo
 * is small enough that one router file is easier to audit than a
 * separate route file per page. The plugin's HMR + dev-time experience
 * still works for the routes themselves.
 *
 * Pages render inside a shared `Layout` (header + bottom nav) except
 * for `/login`, which is intentionally chromeless.
 */

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'layout',
  component: Layout,
});

const homeRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  component: HomePage,
});

const restaurantsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/restaurants',
  component: RestaurantsPage,
});

const restaurantDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/restaurants/$restaurantId',
  component: RestaurantDetailPage,
});

const menuItemRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/restaurants/$restaurantId/items/$itemId',
  component: MenuItemPage,
});

const shopRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/shop',
  component: ShopPage,
});

const productRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/shop/$productId',
  component: ProductDetailPage,
});

const cartRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/cart',
  component: CartPage,
});

const checkoutRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/checkout',
  component: CheckoutPage,
});

const promotionsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/promotions',
  component: PromotionsPage,
});

const profileRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/profile',
  component: ProfilePage,
});

const settingsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  layoutRoute.addChildren([
    homeRoute,
    restaurantsRoute,
    restaurantDetailRoute,
    menuItemRoute,
    shopRoute,
    productRoute,
    cartRoute,
    checkoutRoute,
    promotionsRoute,
    profileRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

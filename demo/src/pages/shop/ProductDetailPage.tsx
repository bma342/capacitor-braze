import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { track } from '../../braze/events';
import { useCart } from '../../cart/store';
import { findProduct } from '../../mockData/products';

import { NotFoundCard } from '../../components/NotFoundCard';

export function ProductDetailPage() {
  const { productId } = useParams({ from: '/layout/shop/$productId' });
  const product = findProduct(productId);
  const addLine = useCart((s) => s.addLine);
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (product) {
      void track.productViewed({
        productId: product.id,
        productName: product.name,
        priceCents: product.priceCents,
        category: product.category,
      });
    }
  }, [product]);

  if (!product) {
    return <NotFoundCard message="That product doesn't exist." backTo="/shop" backLabel="Back to shop" />;
  }

  async function handleAddToCart() {
    if (!product || !product.inStock) return;
    setAdding(true);
    addLine({
      source: 'shop',
      itemId: product.id,
      name: product.name,
      priceCents: product.priceCents,
      quantity,
      metadata: { category: product.category },
    });
    await track.addedToCart({
      source: 'shop',
      itemId: product.id,
      itemName: product.name,
      priceCents: product.priceCents,
      quantity,
    });
    await navigate({ to: '/cart' });
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-6 grid h-72 w-full place-items-center rounded-3xl bg-neutral-100 text-8xl">
        {product.imageEmoji}
      </div>

      <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{product.category}</div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{product.name}</h1>
      <div className="mb-3 flex items-baseline gap-2 text-sm">
        <span className="text-neutral-500">★ {product.rating.toFixed(1)}</span>
        {!product.inStock && (
          <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs text-white">Sold out</span>
        )}
      </div>
      <p className="mb-6 text-neutral-600">{product.description}</p>

      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-neutral-500">Quantity</span>
        <div className="flex items-center overflow-hidden rounded-lg border border-neutral-300">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={!product.inStock}
            className="px-3 py-1.5 text-lg font-medium hover:bg-neutral-100 disabled:opacity-50"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-10 text-center tabular-nums">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(20, q + 1))}
            disabled={!product.inStock}
            className="px-3 py-1.5 text-lg font-medium hover:bg-neutral-100 disabled:opacity-50"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAddToCart}
        disabled={adding || !product.inStock}
        className="flex w-full items-center justify-between rounded-xl bg-brand-500 px-5 py-3.5 font-medium text-white hover:bg-brand-600 disabled:bg-neutral-300 disabled:text-neutral-500"
      >
        <span>{product.inStock ? 'Add to cart' : 'Sold out'}</span>
        {product.inStock && (
          <span className="tabular-nums">${((product.priceCents * quantity) / 100).toFixed(2)}</span>
        )}
      </button>
    </div>
  );
}

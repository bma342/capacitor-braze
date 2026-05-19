export function PromotionsPage() {
  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-semibold">Promotions</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Content cards feed lands in <code>L.6</code> via{' '}
        <code>Braze.getContentCards</code> + <code>addListener('contentCardsUpdated')</code>.
      </p>
    </div>
  );
}

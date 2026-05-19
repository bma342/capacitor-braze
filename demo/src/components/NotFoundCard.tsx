import { Link } from '@tanstack/react-router';

interface NotFoundCardProps {
  message: string;
  backTo: '/restaurants' | '/shop' | '/';
  backLabel: string;
}

/**
 * Empty-state card shown when a deep-link target doesn't resolve in
 * the mock data layer. The `backTo` prop is restricted to known routes
 * so TanStack Router's typed-routes check catches typos at compile time.
 */
export function NotFoundCard({ message, backTo, backLabel }: NotFoundCardProps) {
  return (
    <div className="px-4 py-10 text-center">
      <div className="text-5xl">🤔</div>
      <p className="mt-3 text-neutral-600">{message}</p>
      <Link to={backTo} className="mt-4 inline-block text-sm text-brand-500 underline">
        {backLabel}
      </Link>
    </div>
  );
}

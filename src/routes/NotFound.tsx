import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <Link to="/" className="text-sm text-brand-600 underline hover:text-brand-700 dark:text-brand-400">
        Back home
      </Link>
    </div>
  );
}

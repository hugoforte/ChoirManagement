// The last resort: nothing else in the tree can catch a render-time throw
// (a hook misuse, the exact class of null-narrowing bug MemberPage's own
// comments warn about). Without this, that error unmounts the whole app to
// a blank white screen instead of a chrome-free but styled fallback — see
// AGENTS.md's "white-screen crash" rule and #29.
import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown) {
    // No error-reporting service wired up yet — at minimum, don't let the
    // failure disappear silently the way a fire-and-forget mutation used to.
    console.error("Unhandled error in the React tree:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 p-6 dark:bg-stone-950">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-stone-900 dark:text-stone-100">Something went wrong.</p>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Try reloading the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Rendered instead of the default message, for example a static fallback for a 3D scene. */
  fallback?: ReactNode;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error caught by boundary", error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div className="container section" role="alert">
        <h1>Something went wrong</h1>
        <p className="lede">An unexpected error occurred while showing this page. Your cart is safe.</p>
        <button className="btn btn-dark" onClick={() => window.location.assign("/")}>
          Back to the shop
        </button>
      </div>
    );
  }
}

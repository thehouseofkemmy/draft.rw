import { Component, ErrorInfo, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          fontFamily: "monospace", padding: "40px 24px", maxWidth: 600, margin: "0 auto",
          color: "#2a1f0f", lineHeight: 1.6,
        }}>
          <p style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#999", marginBottom: 20 }}>
            drafts.rw — error
          </p>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#8b3a3a" }}>
            something crashed.
          </p>
          <pre style={{
            background: "#f5f0eb", padding: "16px", fontSize: 12,
            overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
            borderLeft: "3px solid #c0392b", marginBottom: 20,
          }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#8b4b2e", color: "#faf7f2", border: "none",
              padding: "10px 20px", cursor: "pointer", fontSize: 11,
              letterSpacing: "0.12em", textTransform: "uppercase",
            }}
          >
            reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

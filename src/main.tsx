import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/providers/AuthProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

/**
 * Provider nesting (outer → inner):
 *
 *   QueryClientProvider  — supplies the shared React Query client.
 *     ThemeProvider      — next-themes; drives Tailwind `dark:` variants.
 *       AuthProvider     — MUST sit inside QueryClientProvider because it calls
 *                          `queryClient.clear()` on sign-out / session loss
 *                          (Requirement 4.4); a provider can only reach a client
 *                          mounted above it.
 *         BrowserRouter  — provides the routing context so `useNavigate` /
 *                          `useParams` in the auth/org hooks and pages resolve.
 *           App          — the route table.
 *
 * StrictMode wraps the whole tree to surface unsafe lifecycles in development.
 */
createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);

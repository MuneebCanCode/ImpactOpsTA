import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import SignInPage from "@/features/auth/SignInPage";
import SignUpPage from "@/features/auth/SignUpPage";
import AcceptInvitePage from "@/features/invitations/AcceptInvitePage";
import DirectoryPage from "@/features/organizations/DirectoryPage";
import OrgDetailPage from "@/features/organizations/OrgDetailPage";
import MemberProfilePage from "@/features/members/MemberProfilePage";

/**
 * Application route table.
 *
 * The provider tree (QueryClientProvider → ThemeProvider → AuthProvider →
 * BrowserRouter) is mounted in {@link file://./main.tsx}; this component only
 * declares the routes, which is why router hooks (`useNavigate`, `useParams`)
 * used by the pages and hooks resolve correctly.
 *
 * Two route groups (design "Frontend Application Architecture"):
 *
 *   Public routes — reachable without a session:
 *     - `/sign-in`        SignInPage      (Requirement 2)
 *     - `/sign-up`        SignUpPage      (Requirement 1)
 *     - `/accept-invite`  AcceptInvitePage (Requirement 16; reads `?id=`)
 *
 *   Protected routes — nested under {@link ProtectedLayout}, which redirects to
 *   `/sign-in` when there is no session and otherwise renders the app chrome
 *   plus the matched route via `<Outlet />` (Requirements 3.1, 3.3):
 *     - index `/`            DirectoryPage   (Requirement 9)
 *     - `/orgs/:orgId`       OrgDetailPage   (Requirement 9.5)
 *
 * Any unmatched path redirects to the Directory; an authenticated admin lands
 * there, while a visitor is bounced on to `/sign-in` by the layout guard.
 */
export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />

      {/* Protected routes (auth-gated by ProtectedLayout) */}
      <Route element={<ProtectedLayout />}>
        <Route index element={<DirectoryPage />} />
        <Route path="/orgs/:orgId" element={<OrgDetailPage />} />
        <Route path="/member" element={<MemberProfilePage />} />
      </Route>

      {/* Catch-all: send unknown paths to the Directory. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

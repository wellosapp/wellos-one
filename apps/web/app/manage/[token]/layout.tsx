// Public manage surface. Anonymous — no Clerk session required. The root
// layout still wraps the tree with ClerkProvider (lazy, doesn't enforce
// auth), so this layout is a minimal pass-through. The middleware leaves
// /manage/* unprotected by default; see apps/web/middleware.ts.

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

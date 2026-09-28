/**
 * Kiosk layout — intentionally bare.
 *
 * The ambient patient kiosk occupies the full viewport via `fixed inset-0` in
 * KioskView. This layout wrapper exists solely to confirm that no marketing
 * chrome (Header / Footer) bleeds into the kiosk experience. All UI chrome is
 * self-contained inside KioskView and its child components.
 */
export default function KioskLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}

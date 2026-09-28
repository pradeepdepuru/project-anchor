import Header from '@/app/components/Header'
import Footer from '@/app/components/Footer'

/**
 * Marketing layout — wraps all public-facing pages (home, blog, posts, pages)
 * with the site Header and Footer. The root layout intentionally omits these
 * so that the kiosk route group gets a clean, full-screen canvas.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <section className="min-h-screen pt-24">
      <Header />
      <main>{children}</main>
      <Footer />
    </section>
  )
}

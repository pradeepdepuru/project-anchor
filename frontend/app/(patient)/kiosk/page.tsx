import Link from 'next/link'
import { Inter, Instrument_Serif } from 'next/font/google'
import { sanityFetch } from '@/sanity/lib/live'
import { allPatientsQuery, dailyChoresQuery, allPersonsQuery, kioskSettingsQuery } from '@/sanity/lib/queries'
import { urlForImage } from '@/sanity/lib/utils'
import { KioskView } from './KioskView'
import { resolveKioskTheme, kioskThemeBody } from '@/sanity/lib/kioskTheme'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Care Hub & Kiosks | Project Anchor',
  description: 'Select an active patient kiosk or view caregiver profiles.',
}

const display = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'] })
const sans = Inter({ subsets: ['latin'] })

// Drop your loop into frontend/public/videos/anchor-hero.mp4 (see notes). If the file is
// missing, the animated gradient underneath shows instead, so the page never looks broken.
const HERO_VIDEO = '/videos/anchor-hero.mp4'
const STUDIO_URL = process.env.NEXT_PUBLIC_SANITY_STUDIO_URL || 'http://localhost:3333'

type Pic = Parameters<typeof urlForImage>[0]

function imageUrl(picture: Pic | null | undefined, size: number) {
  if (!picture?.asset?._ref) return null
  try {
    return urlForImage(picture)?.width(size).height(size).fit('crop').url() || null
  } catch {
    return null
  }
}

const cleanSlug = (v: string) => v.replace(/^\/?(kiosk\/)?/, '').replace(/^\/+/, '')

export default async function KioskIndexPage() {
  const [{ data: patients }, { data: allPersons }, { data: themeSettings }] = await Promise.all([
    sanityFetch({ query: allPatientsQuery }),
    sanityFetch({ query: allPersonsQuery }),
    sanityFetch({ query: kioskSettingsQuery }),
  ])
  const theme = resolveKioskTheme(themeSettings?.kioskTheme)

  // Caregivers: persons who are not marked as active patients
  const caregivers = (allPersons ?? []).filter(
    (p) => p.isPatient !== true && !patients?.some((pat) => pat._id === p._id),
  )

  const hasConfiguredProfiles = (patients && patients.length > 0) || caregivers.length > 0

  // 1. Configured profiles exist in Sanity: render the Care Directory Hub
  if (hasConfiguredProfiles) {
    const totalTasks = (patients ?? []).reduce((n, p) => n + (p.choreCount || 0), 0)
    const stats = [
      { value: patients?.length ?? 0, label: 'Care recipients' },
      { value: caregivers.length, label: 'Family & caregivers' },
      { value: totalTasks, label: 'Scheduled daily tasks' },
    ]

    return (
      <div
        data-kiosk-theme={theme}
        className={`${sans.className} fixed inset-0 z-40 overflow-y-auto ${kioskThemeBody[theme]} selection:bg-amber-400/30`}
      >
        {/* ───────────── HERO ───────────── */}
        <section className="relative isolate flex min-h-[92vh] flex-col overflow-hidden">
          {/* Fallback ambient gradient (visible if video is absent or motion is reduced) */}
          <div aria-hidden className="absolute inset-0 -z-30">
            <div className="absolute -left-1/4 top-[-20%] h-[70vh] w-[70vw] rounded-full bg-amber-500/20 blur-[140px] motion-safe:animate-pulse" />
            <div className="absolute -right-1/4 bottom-[-30%] h-[70vh] w-[60vw] rounded-full bg-emerald-500/10 blur-[140px]" />
          </div>

          <video
            aria-hidden
            className="absolute inset-0 -z-20 h-full w-full object-cover opacity-40 motion-reduce:hidden"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          >
            <source src={HERO_VIDEO} type="video/mp4" />
          </video>

          {/* Readability scrim + fine dot grid */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 kiosk-hero-scrim"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_80%)]"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          />

          {/* Top bar */}
          <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
            <Link href="/kiosk" className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
              </span>
              <span className={`${display.className} [word-spacing:0.12em] text-2xl tracking-tight text-white`}>Anchor</span>
            </Link>

            <nav className="flex items-center gap-2 text-sm text-zinc-300">
              <a href="#recipients" className="hidden rounded-full px-4 py-2 transition-colors hover:bg-white/10 hover:text-white sm:inline-block">
                Care recipients
              </a>
              <a href="#family" className="hidden rounded-full px-4 py-2 transition-colors hover:bg-white/10 hover:text-white sm:inline-block">
                Family &amp; caregivers
              </a>
              <Link
                href="/caregiver/alerts"
                className="rounded-full px-4 py-2 transition-colors hover:bg-white/10 hover:text-white"
              >
                Caregiver alerts
              </Link>
              <a
                href={STUDIO_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/25 px-4 py-2 text-white transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                Open Studio
              </a>
            </nav>
          </header>

          {/* Headline block */}
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-16 pt-10 sm:px-10">
            <h1 className={`${display.className} [word-spacing:0.12em] max-w-4xl text-[clamp(3rem,8vw,6.5rem)] leading-[0.98] tracking-tight text-white`}>
              A calmer day, anchored in what they know.
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-zinc-300">
              Ambient room kiosks that guide daily routines, bring familiar faces forward, and keep families
              close. Every detail is managed live from Sanity Studio.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <a
                href="#recipients"
                className="rounded-full bg-amber-400 px-7 py-3.5 text-base font-semibold text-zinc-950 transition-colors hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Choose a kiosk
              </a>
              <a
                href="#family"
                className="rounded-full border border-white/25 px-7 py-3.5 text-base font-medium text-white transition-colors hover:bg-white/10"
              >
                View family &amp; caregivers
              </a>
            </div>
          </div>

          {/* Live stats */}
          <div className="mx-auto w-full max-w-6xl px-6 pb-10 sm:px-10">
            <dl className="grid grid-cols-1 border-t border-white/15 sm:grid-cols-3">
              {stats.map((s, i) => (
                <div key={s.label} className={`py-6 sm:px-6 ${i > 0 ? 'sm:border-l sm:border-white/15' : 'sm:pl-0'}`}>
                  <dt className="text-sm text-zinc-400">{s.label}</dt>
                  <dd className={`${display.className} [word-spacing:0.12em] mt-1 text-5xl text-white`}>{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ───────────── RECIPIENTS ───────────── */}
        <div data-kiosk-theme={theme} className={kioskThemeBody[theme]}>
          <main className="mx-auto w-full max-w-6xl px-6 sm:px-10">
            {patients && patients.length > 0 && (
              <section id="recipients" className="scroll-mt-6 py-20">
                <div className="mb-12 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <h2 className={`${display.className} [word-spacing:0.12em] text-5xl tracking-tight text-white sm:text-6xl`}>Care recipients</h2>
                  <p className="max-w-sm text-base leading-relaxed text-zinc-400">
                    Launch a personal bedside kiosk with their routines, memory cards, and Anchor companion.
                  </p>
                </div>

                <div className={`grid grid-cols-1 gap-6 sm:grid-cols-2 ${patients.length > 2 ? 'lg:grid-cols-3' : ''}`}>
                  {patients.map((p) => {
                    const pic = imageUrl(p.picture, 640)
                    const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Patient'
                    const tasks = p.choreCount || 0

                    return (
                      <Link
                        key={p._id}
                        href={`/kiosk/${cleanSlug(p.slug || p._id)}`}
                        className="group relative flex flex-col overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900/60 transition-colors hover:border-amber-400/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400"
                      >
                        <div className="relative aspect-[4/3] overflow-hidden bg-zinc-800">
                          {pic ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={pic}
                              alt={name}
                              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                            />
                          ) : (
                            <div className={`${display.className} [word-spacing:0.12em] flex h-full w-full items-center justify-center text-7xl text-amber-200`}>
                              {p.firstName?.[0] || 'P'}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent" />
                        </div>

                        <div className="flex flex-1 flex-col gap-6 p-6">
                          <div>
                            <h3 className={`${display.className} [word-spacing:0.12em] text-3xl text-white`}>{name}</h3>
                            <p className="mt-1 text-sm text-zinc-400">
                              {tasks} scheduled {tasks === 1 ? 'task' : 'tasks'} today
                            </p>
                          </div>
                          <span className="mt-auto inline-flex w-fit items-center gap-2 rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors group-hover:bg-amber-300">
                            Launch kiosk <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}

            {/* ───────────── FAMILY & CAREGIVERS ───────────── */}
            {caregivers.length > 0 && (
              <section id="family" className="scroll-mt-6 border-t border-white/10 py-20">
                <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <h2 className={`${display.className} [word-spacing:0.12em] text-5xl tracking-tight text-white sm:text-6xl`}>Family &amp; caregivers</h2>
                  <p className="max-w-sm text-base leading-relaxed text-zinc-400">
                    The people who anchor each care recipient&rsquo;s day. Open a profile to see their memory stories.
                  </p>
                </div>

                <ul className="divide-y divide-white/10 border-y border-white/10">
                  {caregivers.map((c) => {
                    const pic = imageUrl(c.picture, 160)
                    const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Caregiver'
                    const relationship = c.relationship
                      ? c.relationship.charAt(0).toUpperCase() + c.relationship.slice(1)
                      : 'Caregiver / Contact'

                    return (
                      <li key={c._id}>
                        <Link
                          href={`/kiosk/${c._id}`}
                          className="group flex items-center gap-5 py-5 transition-colors hover:bg-white/[0.03] sm:px-4"
                        >
                          <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full border border-white/15 bg-zinc-800">
                            {pic ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={pic} alt={name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-zinc-300">
                                {c.firstName?.[0] || 'C'}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-lg font-medium text-white">{name}</div>
                            <div className="text-sm text-amber-300/90">{relationship}</div>
                          </div>

                          <div className="hidden text-sm text-zinc-500 sm:block">{c.phoneNumber || 'Contact on file'}</div>
                          <span aria-hidden className="text-zinc-500 transition-all group-hover:translate-x-1 group-hover:text-white">
                            →
                          </span>
                          <span className="sr-only">View profile</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </main>

          <footer className="mx-auto w-full max-w-6xl border-t border-white/10 px-6 py-8 text-sm text-zinc-500 sm:px-10">
            Patients, routines, and family contacts are managed live in{' '}
            <a
              href={STUDIO_URL}
              target="_blank"
              rel="noreferrer"
              className="text-amber-300/90 underline underline-offset-4 hover:text-amber-200"
            >
              Sanity Studio
            </a>
            .
          </footer>
        </div>
      </div>
    )
  }

  // 2. Fallback demo mode if no patient or caregiver documents exist yet in Sanity Content Lake
  const [{ data: chores }, { data: persons }, { data: kioskSettings }] = await Promise.all([
    sanityFetch({ query: dailyChoresQuery }),
    sanityFetch({ query: allPersonsQuery }),
    sanityFetch({ query: kioskSettingsQuery }),
  ])

  return (
    <KioskView
      initialChores={chores ?? []}
      persons={persons ?? []}
      patient={{
        _id: 'robert',
        firstName: 'Robert',
        lastName: 'Chen',
      }}
      kioskSettings={kioskSettings}
    />
  )
}

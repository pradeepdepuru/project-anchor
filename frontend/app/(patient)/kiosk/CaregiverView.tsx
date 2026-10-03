import Link from 'next/link'
import { urlForImage } from '@/sanity/lib/utils'
import { Inter, Instrument_Serif } from 'next/font/google'
import { sanityFetch } from '@/sanity/lib/live'
import { kioskSettingsQuery } from '@/sanity/lib/queries'
import { resolveKioskTheme, kioskThemeBody } from '@/sanity/lib/kioskTheme'

const display = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'] })
const sans = Inter({ subsets: ['latin'] })
const STUDIO_URL = process.env.NEXT_PUBLIC_SANITY_STUDIO_URL || 'http://localhost:3333'

interface CaregiverViewProps {
  person: {
    _id: string
    firstName: string
    lastName?: string | null
    relationship?: string | null
    phoneNumber?: string | null
    picture?: {
      asset?: {
        _ref?: string
        _id?: string
      }
    } | null
    coreMemories?: Array<{
      _key?: string
      title: string
      storyText: string
      year?: string | null
    }> | null
    patient?: {
      _id: string
      firstName: string
      lastName?: string | null
      slug?: string | null
    } | null
  }
}

export async function CaregiverView({ person }: CaregiverViewProps) {
  const { data: settings } = await sanityFetch({ query: kioskSettingsQuery })
  const theme = resolveKioskTheme(settings?.kioskTheme)
  const name = `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Caregiver'
  const relationshipLabel = person.relationship
    ? person.relationship.charAt(0).toUpperCase() + person.relationship.slice(1)
    : 'Caregiver / Family Member'

  let pictureUrl: string | null = null
  if (person.picture?.asset?._ref) {
    try {
      pictureUrl = urlForImage(person.picture)?.width(300).height(300).fit('crop').url() || null
    } catch {
      pictureUrl = null
    }
  }

  const associatedPatient = person.patient
  const associatedPatientName = associatedPatient
    ? `${associatedPatient.firstName} ${associatedPatient.lastName || ''}`.trim()
    : null
  const patientSlug = associatedPatient
    ? (associatedPatient.slug || associatedPatient._id).replace(/^\/?(kiosk\/)?/, '').replace(/^\/+/, '')
    : null

  return (
    <div
      data-kiosk-theme={theme}
      className={`${sans.className} relative min-h-screen overflow-hidden ${kioskThemeBody[theme]} selection:bg-amber-400/30`}
    >
      {/* Ambient backdrop (matches directory + kiosk) */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-amber-500/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 45%)',
            maskImage: 'linear-gradient(to bottom, black, transparent 45%)',
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-3xl px-6 py-10 sm:px-10 sm:py-14">
        {/* Top bar */}
        <div className="mb-12 flex items-center justify-between gap-4">
          <Link
            href="/kiosk"
            className="inline-flex items-center gap-2 rounded-full text-sm text-zinc-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400"
          >
            <span aria-hidden>←</span> Back to directory
          </Link>
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1 text-sm text-amber-200">
            Family &amp; caregiver profile
          </span>
        </div>

        {/* Profile header */}
        <div className="flex flex-col items-center gap-7 text-center sm:flex-row sm:items-center sm:text-left">
          <div className="h-36 w-36 flex-none overflow-hidden rounded-full border border-white/15 bg-zinc-800">
            {pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pictureUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              <div className={`${display.className} flex h-full w-full items-center justify-center text-6xl text-amber-200`}>
                {person.firstName?.[0] || 'C'}
              </div>
            )}
          </div>
          <div>
            <h1 className={`${display.className} text-5xl leading-none tracking-tight text-white [word-spacing:0.12em] sm:text-6xl`}>
              {name}
            </h1>
            <p className="mt-3 text-lg text-amber-300">{relationshipLabel}</p>
            {person.phoneNumber && <p className="mt-1.5 text-base text-zinc-400">{person.phoneNumber}</p>}
          </div>
        </div>

        {/* Connected care recipient */}
        <section className="mt-12">
          {associatedPatient && patientSlug ? (
            <div className="flex flex-col items-start justify-between gap-5 rounded-[28px] border border-amber-400/30 bg-amber-400/[0.06] p-7 sm:flex-row sm:items-center">
              <div>
                <div className="text-sm text-zinc-400">Connected care recipient</div>
                <div className={`${display.className} mt-1 text-4xl text-white [word-spacing:0.12em]`}>
                  {associatedPatientName}
                </div>
                <p className="mt-1.5 text-base text-zinc-400">Open their ambient bedside kiosk.</p>
              </div>
              <Link
                href={`/kiosk/${patientSlug}`}
                className="inline-flex flex-none items-center gap-2 rounded-full bg-amber-400 px-7 py-3.5 text-base font-semibold text-zinc-950 transition-colors hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Launch patient kiosk <span aria-hidden>→</span>
              </Link>
            </div>
          ) : (
            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-7">
              <div className="text-sm text-zinc-400">Connected care recipient</div>
              <p className="mt-2 text-base text-zinc-300">
                No patient is linked to this profile yet. You can link one in Sanity Studio.
              </p>
              <Link
                href="/kiosk"
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-white/10"
              >
                Browse all patients <span aria-hidden>→</span>
              </Link>
            </div>
          )}
        </section>

        {/* Memory anchors */}
        {person.coreMemories && person.coreMemories.length > 0 && (
          <section className="mt-14">
            <h2 className={`${display.className} text-4xl tracking-tight text-white [word-spacing:0.12em]`}>
              Shared memory anchors
            </h2>
            <p className="mt-2 max-w-xl text-base leading-relaxed text-zinc-400">
              Stories the Anchor companion uses to reassure and ground the patient in familiar moments.
            </p>
            <ul className="mt-7 divide-y divide-white/10 border-y border-white/10">
              {person.coreMemories.map((m, idx) => (
                <li key={m._key || idx} className="py-6">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-xl font-semibold text-white">{m.title}</h3>
                    {m.year && <span className="flex-none text-sm text-zinc-500">{m.year}</span>}
                  </div>
                  <p className="mt-2 text-base leading-relaxed text-zinc-300">{m.storyText}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* About the kiosk (kept from the original, quieter) */}
        <aside className="mt-14 rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-base leading-relaxed text-zinc-400">
          <p>
            The <span className="font-medium text-zinc-200">ambient kiosk</span> (daily chores, AI companion and memory
            cards) is designed for care recipients living with dementia or cognitive decline. Your profile, photo and
            stories serve as memory anchors for them.
          </p>
        </aside>

        {/* Footer */}
        <footer className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-sm text-zinc-500 sm:flex-row sm:items-center">
          <span>Manage roles and chore assignments in Sanity</span>
          <a
            href={STUDIO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-amber-300/90 underline underline-offset-4 hover:text-amber-200"
          >
            Open Sanity Studio ↗
          </a>
        </footer>
      </div>
    </div>
  )
}

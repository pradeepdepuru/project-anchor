import Link from 'next/link'
import { sanityFetch } from '@/sanity/lib/live'
import { allPatientsQuery, dailyChoresQuery, allPersonsQuery, kioskSettingsQuery } from '@/sanity/lib/queries'
import { urlForImage } from '@/sanity/lib/utils'
import { KioskView } from './KioskView'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Care Hub & Kiosks | Project Anchor',
  description: 'Select an active patient kiosk or view caregiver profiles.',
}

/**
 * Care Companion Directory & Kiosk Hub
 *
 * Displays active care recipients (patients) with links to their ambient room kiosks,
 * and lists registered family members and caregivers with links to their caregiver profiles.
 * If the dataset is completely empty, gracefully falls back to the Robert demo profile.
 */
export default async function KioskIndexPage() {
  const [{ data: patients }, { data: allPersons }] = await Promise.all([
    sanityFetch({
      query: allPatientsQuery,
    }),
    sanityFetch({
      query: allPersonsQuery,
    }),
  ])

  // Caregivers: persons who are not marked as active patients
  const caregivers = (allPersons ?? []).filter(
    (p) => p.isPatient !== true && !patients?.some((pat) => pat._id === p._id),
  )

  const hasConfiguredProfiles = (patients && patients.length > 0) || caregivers.length > 0

  // 1. If configured profiles exist in Sanity, render the Care Directory Hub
  if (hasConfiguredProfiles) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-zinc-950 text-zinc-100 overflow-y-auto font-sans p-6 sm:p-12 lg:p-16 select-none">
        <div className="max-w-5xl mx-auto w-full">
          <header className="border-b border-zinc-800 pb-6 mb-10 flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-block w-4 h-4 rounded-full bg-emerald-500 animate-pulse" />
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                  Care Companion Kiosks
                </h1>
              </div>
              <p className="text-base sm:text-lg text-zinc-400 mt-2">
                Select a care recipient to launch their ambient room kiosk, or manage caregiver profiles.
              </p>
            </div>
          </header>

          {/* Section 1: Care Recipients (Ambient Kiosks) */}
          {patients && patients.length > 0 && (
            <section className="mb-12">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-xl">🛏️</span>
                <h2 className="text-xl font-bold tracking-tight text-white">
                  Care Recipients (Ambient Kiosks)
                </h2>
                <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-semibold">
                  {patients.length} active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {patients.map((p) => {
                  const cleanSlug = (p.slug || p._id).replace(/^\/?(kiosk\/)?/, '').replace(/^\/+/, '')
                  let pictureUrl: string | null = null
                  if (p.picture?.asset?._ref) {
                    try {
                      pictureUrl = urlForImage(p.picture)?.width(300).height(300).fit('crop').url() || null
                    } catch {
                      pictureUrl = null
                    }
                  }
                  const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Patient'

                  return (
                    <Link
                      key={p._id}
                      href={`/kiosk/${cleanSlug}`}
                      className="group relative flex flex-col items-center text-center bg-zinc-900/70 hover:bg-zinc-800/90 border border-zinc-800 hover:border-amber-400/50 rounded-3xl p-6 transition-all hover:scale-[1.02] shadow-lg hover:shadow-amber-500/10"
                    >
                      <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700 group-hover:border-amber-400 mb-4 relative shadow-inner">
                        {pictureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={pictureUrl} alt={name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-amber-200">
                            {p.firstName?.[0] || 'P'}
                          </div>
                        )}
                      </div>

                      <h3 className="text-xl font-bold text-white group-hover:text-amber-300 transition-colors">
                        {name}
                      </h3>
                      <p className="text-xs text-emerald-400 mt-1 uppercase tracking-wider font-semibold">
                        Care Recipient
                      </p>

                      <div className="mt-4 pt-4 border-t border-zinc-800/80 w-full flex items-center justify-between text-xs text-zinc-400">
                        <span>{p.choreCount || 0} scheduled tasks</span>
                        <span className="text-amber-400 font-bold group-hover:translate-x-1 transition-transform">
                          Launch Kiosk →
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {/* Section 2: Family & Caregivers */}
          {caregivers.length > 0 && (
            <section className="mb-12">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-xl">👥</span>
                <h2 className="text-xl font-bold tracking-tight text-white">
                  Family Members & Caregivers
                </h2>
                <span className="ml-2 text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-semibold">
                  {caregivers.length} registered
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {caregivers.map((c) => {
                  let pictureUrl: string | null = null
                  if (c.picture?.asset?._ref) {
                    try {
                      pictureUrl = urlForImage(c.picture)?.width(300).height(300).fit('crop').url() || null
                    } catch {
                      pictureUrl = null
                    }
                  }
                  const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Caregiver'
                  const relationshipLabel = c.relationship
                    ? c.relationship.charAt(0).toUpperCase() + c.relationship.slice(1)
                    : 'Caregiver / Contact'

                  return (
                    <Link
                      key={c._id}
                      href={`/kiosk/${c._id}`}
                      className="group relative flex flex-col items-center text-center bg-zinc-900/40 hover:bg-zinc-800/70 border border-zinc-800/80 hover:border-zinc-700 rounded-3xl p-6 transition-all hover:scale-[1.01]"
                    >
                      <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700/80 group-hover:border-zinc-600 mb-4 relative shadow-inner">
                        {pictureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={pictureUrl} alt={name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-zinc-300">
                            {c.firstName?.[0] || 'C'}
                          </div>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-zinc-200 group-hover:text-white transition-colors">
                        {name}
                      </h3>
                      <p className="text-xs text-amber-400/90 mt-1 uppercase tracking-wider font-semibold">
                        {relationshipLabel}
                      </p>

                      <div className="mt-4 pt-4 border-t border-zinc-800/80 w-full flex items-center justify-between text-xs text-zinc-500">
                        <span>{c.phoneNumber || 'Contact on file'}</span>
                        <span className="text-zinc-400 group-hover:text-zinc-200 font-medium">
                          View Profile →
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          <footer className="mt-8 pt-6 border-t border-zinc-800/60 text-center text-xs text-zinc-500">
            Patients, routines, and family contacts can be customized and managed live in{' '}
            <a
              href="http://localhost:3333"
              target="_blank"
              rel="noreferrer"
              className="text-amber-400/80 hover:text-amber-300 underline underline-offset-4"
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
    sanityFetch({
      query: dailyChoresQuery,
    }),
    sanityFetch({
      query: allPersonsQuery,
    }),
    sanityFetch({
      query: kioskSettingsQuery,
    }),
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

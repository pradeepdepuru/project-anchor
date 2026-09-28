import Link from 'next/link'
import { urlForImage } from '@/sanity/lib/utils'

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

export function CaregiverView({ person }: CaregiverViewProps) {
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 sm:p-12 font-sans select-none">
      <div className="max-w-2xl w-full bg-zinc-900/80 border border-zinc-800 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-md">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between pb-6 border-b border-zinc-800/80 mb-8">
          <Link
            href="/kiosk"
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors bg-zinc-800/60 hover:bg-zinc-800 px-4 py-2 rounded-full border border-zinc-700/60"
          >
            <span>←</span> Back to Directory
          </Link>
          <span className="text-xs font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full">
            Family & Caregiver Profile
          </span>
        </div>

        {/* Profile Header */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left mb-8">
          <div className="w-28 h-28 rounded-full overflow-hidden bg-zinc-800 border-2 border-amber-400/40 shadow-inner flex-shrink-0">
            {pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pictureUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-amber-200">
                {person.firstName?.[0] || 'C'}
              </div>
            )}
          </div>

          <div className="flex-1">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">{name}</h1>
            <p className="text-base text-amber-400 font-medium mt-1">{relationshipLabel}</p>
            {person.phoneNumber && (
              <p className="text-sm text-zinc-400 mt-2 flex items-center justify-center sm:justify-start gap-2">
                <span>📞</span> {person.phoneNumber}
              </p>
            )}
          </div>
        </div>

        {/* Architectural Context Card */}
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-5 mb-8 text-sm leading-relaxed text-zinc-300 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
            <span>ℹ️</span> Caregiver View Notice
          </div>
          <p>
            The <strong>Ambient Kiosk</strong> (daily chores checklist, AI grounding chat, and cognitive memory cards) is designed specifically for care recipients living with dementia or cognitive decline.
          </p>
          <p className="text-zinc-400 text-xs">
            As a registered caregiver or family contact, your profile details, photo, and memory stories serve as memory anchors for the patient.
          </p>
        </div>

        {/* Associated Patient Action */}
        {associatedPatient && patientSlug ? (
          <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 border border-amber-500/30 rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Connected Care Recipient
              </div>
              <div className="text-xl font-bold text-white mt-1">
                {associatedPatientName}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Launch their ambient bedside room kiosk.
              </p>
            </div>
            <Link
              href={`/kiosk/${patientSlug}`}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-6 py-3 rounded-full transition-all shadow-md hover:shadow-amber-500/20 text-sm whitespace-nowrap active:scale-95"
            >
              Launch Patient Kiosk ➔
            </Link>
          </div>
        ) : (
          <div className="bg-zinc-950/40 border border-zinc-800/80 rounded-2xl p-6 mb-8 text-center sm:text-left">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Connected Care Recipient
            </div>
            <p className="text-sm text-zinc-400 mt-2">
              No specific patient is currently linked to this caregiver profile in Sanity Studio.
            </p>
            <div className="mt-4">
              <Link
                href="/kiosk"
                className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-medium px-5 py-2.5 rounded-full text-xs transition-colors"
              >
                Browse All Patients ➔
              </Link>
            </div>
          </div>
        )}

        {/* Core Memories / Anchor Stories (if any) */}
        {person.coreMemories && person.coreMemories.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs uppercase tracking-wider font-bold text-zinc-400 mb-3">
              Shared Memory Anchors for Validation AI
            </h3>
            <div className="space-y-3">
              {person.coreMemories.map((m, idx) => (
                <div key={m._key || idx} className="bg-zinc-950/50 border border-zinc-800/80 rounded-xl p-4 text-xs">
                  <div className="font-semibold text-zinc-200 flex items-center justify-between">
                    <span>{m.title}</span>
                    {m.year && <span className="text-zinc-500">{m.year}</span>}
                  </div>
                  <p className="text-zinc-400 mt-1">{m.storyText}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-6 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <span>Manage roles & chore assignments in Sanity</span>
          <a
            href="http://localhost:3333"
            target="_blank"
            rel="noreferrer"
            className="text-amber-400 hover:text-amber-300 underline underline-offset-4"
          >
            Open Sanity Studio ↗
          </a>
        </div>

      </div>
    </div>
  )
}

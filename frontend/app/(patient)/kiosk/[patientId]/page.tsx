import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { sanityFetch } from '@/sanity/lib/live'
import {
  patientByIdOrSlugQuery,
  dailyChoresByPatientQuery,
  familyMembersByPatientQuery,
  kioskSettingsQuery,
} from '@/sanity/lib/queries'
import { KioskView } from '../KioskView'
import { CaregiverView } from '../CaregiverView'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ patientId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { patientId } = await params
  const { data: patient } = await sanityFetch({
    query: patientByIdOrSlugQuery,
    params: { id: patientId },
    stega: false,
  })

  const name = patient?.firstName ? `${patient.firstName} ${patient.lastName || ''}`.trim() : 'Profile'

  if (patient && patient.isPatient === false) {
    return {
      title: `${name} (Caregiver Profile) | Project Anchor`,
      description: `Caregiver and family contact profile for ${name}.`,
    }
  }

  return {
    title: `${name}'s Care Kiosk | Project Anchor`,
    description: `Accessible, ambient daily companion kiosk for ${name}.`,
  }
}

/**
 * Dedicated Patient Kiosk Screen or Caregiver Profile Gateway
 *
 * Scoped to an individual patient identified by Sanity _id or URL slug.
 * If the profile represents a caregiver or family contact, displays the Caregiver Portal.
 * If it is an active patient, loads their personalized daily chores, family memory triggers,
 * and passes their identity to Anchor AI.
 */
export default async function PatientKioskPage({ params }: PageProps) {
  const { patientId } = await params

  // 1. Fetch Person/Patient Document
  const { data: patient } = await sanityFetch({
    query: patientByIdOrSlugQuery,
    params: { id: patientId },
  })

  // If patient not found by slug or ID
  if (!patient) {
    notFound()
  }

  // 2. If this person is a registered caregiver/family member rather than a care recipient:
  if (patient.isPatient === false) {
    return <CaregiverView person={patient} />
  }

  // 3. Fetch Patient's Specific Chores & Family Members in parallel
  const targetId = patient._id

  const [{ data: chores }, { data: familyMembers }, { data: kioskSettings }] = await Promise.all([
    sanityFetch({
      query: dailyChoresByPatientQuery,
      params: { patientId: targetId },
    }),
    sanityFetch({
      query: familyMembersByPatientQuery,
      params: { patientId: targetId },
    }),
    sanityFetch({
      query: kioskSettingsQuery,
    }),
  ])

  return (
    <KioskView
      initialChores={chores ?? []}
      persons={familyMembers ?? []}
      patient={patient}
      caregivers={patient.caregivers ?? []}
      kioskSettings={kioskSettings}
    />
  )
}

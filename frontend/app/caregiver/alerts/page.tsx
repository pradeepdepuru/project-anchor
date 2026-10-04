import { client } from '@/sanity/lib/client'
import { token as readToken } from '@/sanity/lib/token'
import { getSession } from '@/sanity/lib/caregiverAuth'
import UnlockForm from './UnlockForm'
import PendingAlerts, { type PendingAlert } from './PendingAlerts'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pending alerts' }

const readClient = client.withConfig({ token: readToken, useCdn: false, stega: false, perspective: 'published' })

// Emergencies first, then hazards, then everything else; newest first inside each group.
const ALERTS_QUERY = `*[_type == "careAlert" && status in ["open", "acknowledged"] && defined(workflowInstanceId)]
  | order(select(type == "medical_emergency" => 0, type == "safety_hazard" => 1, 2) asc, raisedAt desc){
    _id, type, description, status, raisedAt,
    "patientName": patient->firstName,
    agentBriefing, suggestedResponse,
    "claimedBy": acknowledgedBy->firstName
  }`

const CAREGIVERS_QUERY = `*[_type == "person" && isPatient != true] | order(firstName asc){
  _id, firstName, lastName, relationship
}`

export default async function CaregiverAlertsPage() {
  if (!process.env.CAREGIVER_PASSCODE) {
    return (
      <main className="min-h-screen bg-stone-950 px-5 py-16 text-stone-100">
        <div className="mx-auto max-w-md">
          <h1 className="text-2xl font-semibold">Caregiver sign-in is not set up</h1>
          <p className="mt-3 text-stone-400">
            Set the CAREGIVER_PASSCODE environment variable on the server, then restart it.
          </p>
        </div>
      </main>
    )
  }

  const session = await getSession()

  if (!session) {
    const caregivers = await readClient.fetch<
      { _id: string; firstName?: string; lastName?: string; relationship?: string }[]
    >(CAREGIVERS_QUERY)
    return <UnlockForm caregivers={caregivers ?? []} />
  }

  const alerts = await readClient.fetch<PendingAlert[]>(ALERTS_QUERY)
  return <PendingAlerts alerts={alerts ?? []} caregiverName={session.name} />
}

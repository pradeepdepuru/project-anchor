import {defineQuery} from 'next-sanity'

/**
 * Copy into sanity/lib/queries.ts.
 *
 * REPLACE these four (same export names, so imports keep working):
 *   allPatientsQuery, patientByIdOrSlugQuery, connectedCaregiversByPatientQuery, familyMembersByPatientQuery
 * ADD the rest.
 *
 * Fixes:
 *  - `slug.current match $id` is gone: it treated the URL segment as a wildcard, so /kiosk/* opened the first person.
 *  - The "unlinked person" fallbacks are gone: they showed every unlinked person as family for every patient.
 *  - `associatedPatient` was never in the schema, so it is removed.
 *  - `relationshipToPatient` is kept as an alias of `relationship`, so KioskView keeps type-checking.
 */

// ---------- REPLACE ----------

export const allPatientsQuery = defineQuery(`
  *[_type == "person" && isPatient == true] | order(firstName asc) {
    _id,
    _type,
    firstName,
    lastName,
    picture,
    "slug": slug.current,
    relationship,
    isPatient,
    "choreCount": count(*[_type == "dailyChore" && patient._ref == ^._id]),
    "caregivers": *[_type == "person" && isPatient != true && patient._ref == ^._id] {
      _id,
      _type,
      firstName,
      lastName,
      picture,
      relationship,
      "relationshipToPatient": relationship,
      phoneNumber
    }
  }
`)

export const patientByIdOrSlugQuery = defineQuery(`
  *[_type == "person" && (
    _id == $id ||
    slug.current == $id ||
    slug.current == "/" + $id ||
    slug.current == "/kiosk/" + $id ||
    slug.current == "kiosk/" + $id
  )][0] {
    _id,
    _type,
    firstName,
    lastName,
    picture,
    "slug": slug.current,
    relationship,
    isPatient,
    coreMemories,
    patient-> {
      _id,
      firstName,
      lastName,
      "slug": slug.current
    },
    "caregivers": *[_type == "person" && isPatient != true && patient._ref == ^._id] {
      _id,
      _type,
      firstName,
      lastName,
      picture,
      relationship,
      "relationshipToPatient": relationship,
      phoneNumber
    }
  }
`)

export const connectedCaregiversByPatientQuery = defineQuery(`
  *[_type == "person" && isPatient != true && patient._ref == $patientId] {
    _id,
    _type,
    firstName,
    lastName,
    picture,
    relationship,
    "relationshipToPatient": relationship,
    phoneNumber
  }
`)

export const familyMembersByPatientQuery = defineQuery(`
  *[_type == "person" && _id != $patientId && patient._ref == $patientId] {
    _id,
    _type,
    firstName,
    lastName,
    picture,
    relationship,
    phoneNumber,
    coreMemories
  }
`)

// ---------- ADD ----------

/** Visits for one patient inside a time window (pass the patient's local day bounds as UTC ISO strings). */
export const visitsByPatientQuery = defineQuery(`
  *[_type == "visit" && patient._ref == $patientId && status != "cancelled"
    && dateTime(start) >= dateTime($dayStart) && dateTime(start) < dateTime($dayEnd)]
    | order(start asc) {
    _id,
    start,
    end,
    purpose,
    visitor-> { _id, firstName, lastName, relationship, picture, "memories": coreMemories[0...2] }
  }
`)

/** Medication orders in force right now: effective, and not superseded by a newer effective order. */
export const currentMedicationOrdersQuery = defineQuery(`
  *[_type == "medicationOrder" && patient._ref == $patientId
    && dateTime(effectiveFrom) <= dateTime(now())
    && count(*[_type == "medicationOrder" && supersedes._ref == ^._id && dateTime(effectiveFrom) <= dateTime(now())]) == 0] {
    _id,
    name,
    dosage,
    steps,
    effectiveFrom,
    changeNote,
    "replaces": supersedes-> { name, effectiveFrom }
  }
`)

/** Open alerts across all patients (for the directory stats strip and a caregiver banner). */
export const openCareAlertsQuery = defineQuery(`
  *[_type == "careAlert" && status == "open"] | order(raisedAt desc) {
    _id,
    type,
    description,
    raisedAt,
    patient-> { _id, firstName, lastName }
  }
`)

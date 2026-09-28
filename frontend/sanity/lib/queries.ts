import {defineQuery} from 'next-sanity'

export const settingsQuery = defineQuery(`*[_type == "settings"][0]`)

/** Fetches the singleton Kiosk Settings document used to control the ambient kiosk UI. */
export const kioskSettingsQuery = defineQuery(`
  *[_type == "kioskSettings"][0] {
    showChatCompanion,
    kioskTheme,
    customWelcomeText,
  }
`)

const postFields = /* groq */ `
  _id,
  "status": select(_originalId in path("drafts.**") => "draft", "published"),
  "title": coalesce(title, "Untitled"),
  "slug": slug.current,
  excerpt,
  coverImage,
  "date": coalesce(date, _updatedAt),
  "author": author->{firstName, lastName, picture},
`

const linkReference = /* groq */ `
  _type == "link" => {
    "page": page->slug.current,
    "post": post->slug.current
  }
`

const linkFields = /* groq */ `
  link {
      ...,
      ${linkReference}
      }
`

export const getPageQuery = defineQuery(`
  *[_type == 'page' && slug.current == $slug][0]{
    _id,
    _type,
    name,
    slug,
    heading,
    subheading,
    "pageBuilder": pageBuilder[]{
      ...,
      _type == "callToAction" => {
        ...,
        button {
          ...,
          ${linkFields}
        }
      },
      _type == "infoSection" => {
        content[]{
          ...,
          markDefs[]{
            ...,
            ${linkReference}
          }
        }
      },
    },
  }
`)

export const sitemapData = defineQuery(`
  *[_type == "page" || _type == "post" && defined(slug.current)] | order(_type asc) {
    "slug": slug.current,
    _type,
    _updatedAt,
  }
`)

export const allPostsQuery = defineQuery(`
  *[_type == "post" && defined(slug.current)] | order(date desc, _updatedAt desc) {
    ${postFields}
  }
`)

export const morePostsQuery = defineQuery(`
  *[_type == "post" && _id != $skip && defined(slug.current)] | order(date desc, _updatedAt desc) [0...$limit] {
    ${postFields}
  }
`)

export const postQuery = defineQuery(`
  *[_type == "post" && slug.current == $slug] [0] {
    content[]{
    ...,
    markDefs[]{
      ...,
      ${linkReference}
    }
  },
    ${postFields}
  }
`)

export const postPagesSlugs = defineQuery(`
  *[_type == "post" && defined(slug.current)]
  {"slug": slug.current}
`)

export const pagesSlugs = defineQuery(`
  *[_type == "page" && defined(slug.current)]
  {"slug": slug.current}
`)

export const dailyChoresQuery = defineQuery(`
  *[_type == "dailyChore"] | order(scheduledTime asc) {
    _id,
    _type,
    title,
    scheduledTime,
    timeOfDay,
    instructions,
    safetyParameters {
      requiresSupervision,
      assistanceLevel,
      priority,
      safetyNotes
    },
    completions[] {
      completedAt,
      status,
      notes,
      _key
    },
    patient-> {
      _id,
      firstName,
      lastName
    }
  }
`)

export const allPersonsQuery = defineQuery(`
  *[_type == "person"] {
    _id,
    _type,
    firstName,
    lastName,
    picture,
    relationship,
    phoneNumber,
    isPatient,
    "slug": slug.current,
    coreMemories
  }
`)

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

export const dailyChoresByPatientQuery = defineQuery(`
  *[_type == "dailyChore" && (
    patient._ref == $patientId ||
    patient->slug.current == $patientId ||
    patient->slug.current == "/" + $patientId ||
    patient->slug.current == "/kiosk/" + $patientId ||
    patient->slug.current == "kiosk/" + $patientId
  )] | order(scheduledTime asc) {
    _id,
    _type,
    title,
    scheduledTime,
    timeOfDay,
    instructions,
    safetyParameters {
      requiresSupervision,
      assistanceLevel,
      priority,
      safetyNotes
    },
    completions[] {
      completedAt,
      status,
      notes,
      _key
    },
    patient-> {
      _id,
      firstName,
      lastName
    }
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

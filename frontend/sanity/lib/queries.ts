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
  *[_type == "person" && (isPatient == true || (!defined(*[_type == "person" && isPatient == true][0]) && count(*[_type == "dailyChore" && patient._ref == ^._id]) > 0))] | order(firstName asc) {
    _id,
    _type,
    firstName,
    lastName,
    picture,
    "slug": slug.current,
    relationship,
    isPatient,
    "choreCount": count(*[_type == "dailyChore" && patient._ref == ^._id]),
    "caregivers": *[_type == "person" && (isPatient == false || !defined(isPatient)) && (patient._ref == ^._id || associatedPatient._ref == ^._id)] {
      _id,
      _type,
      firstName,
      lastName,
      picture,
      relationship,
      "relationshipToPatient": coalesce(relationship, relationshipToPatient),
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
    slug.current == "kiosk/" + $id ||
    slug.current match $id
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
    "caregivers": *[_type == "person" && (isPatient == false || !defined(isPatient)) && (patient._ref == ^._id || associatedPatient._ref == ^._id)] {
      _id,
      _type,
      firstName,
      lastName,
      picture,
      relationship,
      "relationshipToPatient": coalesce(relationship, relationshipToPatient),
      phoneNumber
    }
  }
`)

export const connectedCaregiversByPatientQuery = defineQuery(`
  *[_type == "person" && (isPatient == false || !defined(isPatient)) && (patient._ref == $patientId || associatedPatient._ref == $patientId)] {
    _id,
    _type,
    firstName,
    lastName,
    picture,
    relationship,
    "relationshipToPatient": coalesce(relationship, relationshipToPatient),
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
  *[_type == "person" && _id != $patientId && (patient._ref == $patientId || (!defined(patient) && (!defined(isPatient) || isPatient == false)))] {
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




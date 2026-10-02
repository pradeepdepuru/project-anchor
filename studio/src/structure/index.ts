import { BellIcon, CogIcon, CalendarIcon, HeartIcon, UserIcon, UsersIcon } from '@sanity/icons'
import type { StructureBuilder, StructureResolver } from 'sanity/structure'

/**
 * Structure builder for Project Anchor Studio.
 * Provides curated navigation: singleton config, patient/caregiver lists,
 * and filtered operational sections.
 */

// Types hidden from the generic fallback list to avoid double-rendering
const HIDDEN_FROM_GENERIC = [
  'kioskSettings',
  'careAlert',
  'person',
  'dailyChore',
  'visit',
  'medicationOrder',
  'settings',
  'assist.instruction.context',
  // CMS-only types — kept in the schema engine, not surfaced in the nav tree
  'post',
  'page',
]

export const structure: StructureResolver = (S: StructureBuilder) =>
  S.list()
    .title('Project Anchor')
    .items([
      // ── Kiosk Settings singleton ──────────────────────────────────────
      S.listItem()
        .title('Kiosk Settings')
        .icon(CogIcon)
        .child(
          S.document()
            .schemaType('kioskSettings')
            .documentId('kioskSettings')
            .title('Kiosk Settings'),
        ),

      S.divider(),

      // ── Patients (isPatient == true) ──────────────────────────────────
      S.listItem()
        .title('Patients')
        .icon(UserIcon)
        .child(
          S.documentList()
            .title('Patients')
            .schemaType('person')
            .filter('_type == "person" && isPatient == true'),
        ),

      // ── Caregivers / Family (isPatient == false or absent) ────────────
      S.listItem()
        .title('Caregivers & Family')
        .icon(UsersIcon)
        .child(
          S.documentList()
            .title('Caregivers & Family')
            .schemaType('person')
            .filter('_type == "person" && (isPatient == false || !defined(isPatient))'),
        ),

      S.divider(),

      // ── Chores by patient ─────────────────────────────────────────────
      S.listItem()
        .title('Chores by patient')
        .icon(CalendarIcon)
        .child(
          S.documentList()
            .title('Chores by patient')
            .schemaType('dailyChore')
            .filter('_type == "dailyChore"')
            .defaultOrdering([{ field: 'scheduledTime', direction: 'asc' }]),
        ),

      // ── Medication orders ─────────────────────────────────────────────
      S.listItem()
        .title('Medication orders')
        .icon(HeartIcon)
        .child(
          S.documentList()
            .title('Medication orders')
            .schemaType('medicationOrder')
            .filter('_type == "medicationOrder"'),
        ),

      // ── Visits ────────────────────────────────────────────────────────
      S.listItem()
        .title('Visits')
        .icon(UsersIcon)
        .child(
          S.documentList()
            .title('Visits')
            .schemaType('visit')
            .filter('_type == "visit"'),
        ),

      // ── Open alerts (careAlert where status == 'open') ─────────────────
      S.listItem()
        .title('Open alerts')
        .icon(BellIcon)
        .child(
          S.documentList()
            .title('Open alerts')
            .schemaType('careAlert')
            .filter('_type == "careAlert" && status == "open"')
            .defaultOrdering([{ field: 'raisedAt', direction: 'desc' }]),
        ),

      S.divider(),

      // ── Generic fallback for remaining unlisted types ─────────────────
      ...S.documentTypeListItems().filter(
        (listItem: any) => !HIDDEN_FROM_GENERIC.includes(listItem.getId() ?? ''),
      ),
    ])

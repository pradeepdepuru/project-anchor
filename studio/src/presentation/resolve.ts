import {
  defineDocuments,
  defineLocations,
  type DocumentLocation,
  type PresentationPluginOptions,
} from 'sanity/presentation'

// Define the home location for the presentation tool
const homeLocation = {
  title: 'Home',
  href: '/',
} satisfies DocumentLocation

// resolveHref() is a convenience function that resolves the URL
// path for different document types and used in the presentation tool.
function resolveHref(documentType?: string, slug?: string): string | undefined {
  switch (documentType) {
    case 'post':
      return slug ? `/posts/${slug}` : undefined
    case 'page':
      return slug ? `/${slug}` : undefined
    case 'person':
      return slug ? `/kiosk/${slug}` : '/kiosk'
    default:
      console.warn('Invalid document type:', documentType)
      return undefined
  }
}

export const resolve: PresentationPluginOptions['resolve'] = {
  mainDocuments: defineDocuments([
    {
      route: '/',
      filter: `_type == "settings" && _id == "siteSettings"`,
    },
    {
      route: '/kiosk',
      filter: `_type == "person" || _type == "dailyChore"`,
    },
    {
      route: '/kiosk/:slug',
      filter: `_type == "person" && (slug.current == $slug || _id == $slug)`,
    },
    {
      route: '/:slug',
      filter: `_type == "page" && (slug.current == $slug || _id == $slug)`,
    },
    {
      route: '/posts/:slug',
      filter: `_type == "post" && (slug.current == $slug || _id == $slug)`,
    },
  ]),
  locations: {
    settings: defineLocations({
      locations: [homeLocation],
      message: 'This document is used on all pages',
      tone: 'positive',
    }),
    page: defineLocations({
      select: {
        name: 'name',
        slug: 'slug.current',
      },
      resolve: (doc) => ({
        locations: [
          {
            title: doc?.name || 'Untitled',
            href: resolveHref('page', doc?.slug)!,
          },
        ],
      }),
    }),
    post: defineLocations({
      select: {
        title: 'title',
        slug: 'slug.current',
      },
      resolve: (doc) => ({
        locations: [
          {
            title: doc?.title || 'Untitled',
            href: resolveHref('post', doc?.slug)!,
          },
          {
            title: 'Home',
            href: '/',
          } satisfies DocumentLocation,
        ].filter(Boolean) as DocumentLocation[],
      }),
    }),
    person: defineLocations({
      select: {
        firstName: 'firstName',
        lastName: 'lastName',
        slug: 'slug.current',
        isPatient: 'isPatient',
      },
      resolve: (doc) => ({
        locations: [
          doc?.slug
            ? {
                title: `${doc.firstName || 'Patient'} Kiosk`,
                href: `/kiosk/${doc.slug}`,
              }
            : null,
          {
            title: 'Care Kiosks Directory',
            href: '/kiosk',
          },
        ].filter(Boolean) as DocumentLocation[],
      }),
    }),
    dailyChore: defineLocations({
      select: {
        title: 'title',
        patientSlug: 'patient->slug.current',
        patientId: 'patient->_id',
      },
      resolve: (doc) => ({
        locations: [
          doc?.patientSlug || doc?.patientId
            ? {
                title: 'Patient Kiosk',
                href: `/kiosk/${doc.patientSlug || doc.patientId}`,
              }
            : null,
          {
            title: 'Kiosk',
            href: '/kiosk',
          },
        ].filter(Boolean) as DocumentLocation[],
      }),
    }),
  },
}
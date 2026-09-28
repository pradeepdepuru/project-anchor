import {person} from './documents/person'
import {page} from './documents/page'
import {post} from './documents/post'
import {dailyChore} from './documents/dailyChore'
import {cognitiveLog} from './documents/cognitiveLog'
import {kioskSettings} from './documents/kioskSettings'
import {callToAction} from './objects/callToAction'
import {infoSection} from './objects/infoSection'
import {settings} from './singletons/settings'
import {link} from './objects/link'
import {blockContent} from './objects/blockContent'
import button from './objects/button'
import {blockContentTextOnly} from './objects/blockContentTextOnly'

// Export an array of all the schema types.  This is used in the Sanity Studio configuration. https://www.sanity.io/docs/studio/schema-types

export const schemaTypes = [
  // Singletons
  settings,
  // Documents
  page,
  post,
  person,
  dailyChore,
  cognitiveLog,
  kioskSettings,
  // Objects
  button,
  blockContent,
  blockContentTextOnly,
  infoSection,
  callToAction,
  link,
]

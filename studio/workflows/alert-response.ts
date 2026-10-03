import {
  defineWorkflow,
  defineField,
  defineStage,
  defineActivity,
  defineAction,
  defineTransition,
} from '@sanity/workflow-engine/define'

/**
 * Alert response (v2): Anchor raises an alert, drafts a caregiver briefing grounded in the
 * patient's memory anchors, and a caregiver reviews it. The caregiver's name travels as an
 * action parameter, so approvals do not depend on which token the server uses.
 *
 *   raised --(Anchor submits briefing)--> review --(caregiver approves)--> resolved
 *     ^                                      |
 *     +--------(caregiver sends back)--------+
 */
export const alertResponse = defineWorkflow({
  name: 'alert-response',
  title: 'Alert response',
  description: 'Anchor drafts a briefing for a raised alert; a caregiver reviews and resolves it.',
  initialStage: 'raised',
  fields: [
    defineField({ type: 'subject', name: 'subject', title: 'Alert', initialValue: { type: 'input' }, required: true }),
    defineField({ type: 'string', name: 'briefing' }),
    defineField({ type: 'string', name: 'suggestedResponse' }),
    defineField({ type: 'string', name: 'responder' }),
    defineField({ type: 'string', name: 'approvedBy' }),
    defineField({ type: 'string', name: 'rejectionReason' }),
  ],
  stages: [
    defineStage({
      name: 'raised',
      title: 'Raised by Anchor',
      description: 'Anchor writes up what happened and a suggested calming response.',
      activities: [
        defineActivity({
          name: 'draft-briefing',
          title: 'Draft the caregiver briefing',
          actions: [
            defineAction({
              name: 'submit-briefing',
              title: 'Submit briefing for review',
              status: 'done',
              params: [
                { type: 'string', name: 'briefing', title: 'What happened', required: true },
                { type: 'string', name: 'suggestedResponse', title: 'Suggested response', required: true },
              ],
              ops: [
                { type: 'field.set', target: { field: 'briefing' }, value: { type: 'param', param: 'briefing' } },
                {
                  type: 'field.set',
                  target: { field: 'suggestedResponse' },
                  value: { type: 'param', param: 'suggestedResponse' },
                },
              ],
            }),
          ],
        }),
      ],
      transitions: [defineTransition({ name: 'to-review', to: 'review', when: '$allActivitiesDone' })],
    }),
    defineStage({
      name: 'review',
      title: 'Caregiver review',
      description: 'A caregiver takes the alert, then approves it or sends it back.',
      activities: [
        defineActivity({
          name: 'review',
          title: 'Review the briefing',
          actions: [
            defineAction({
              name: 'clear-rejection',
              title: 'Clear the previous rejection',
              when: 'true', // fires on entry so a redrafted briefing is not bounced straight back
              ops: [{ type: 'field.unset', target: { field: 'rejectionReason' } }],
            }),
            defineAction({
              name: 'claim',
              title: 'Take this alert',
              filter: '!defined($fields.responder)', // open until a caregiver takes it
              params: [{ type: 'string', name: 'caregiver', title: 'Caregiver name', required: true }],
              ops: [{ type: 'field.set', target: { field: 'responder' }, value: { type: 'param', param: 'caregiver' } }],
            }),
            defineAction({
              name: 'approve',
              title: 'Approve and resolve',
              filter: 'defined($fields.responder)',
              status: 'done',
              params: [{ type: 'string', name: 'caregiver', title: 'Caregiver name', required: true }],
              ops: [{ type: 'field.set', target: { field: 'approvedBy' }, value: { type: 'param', param: 'caregiver' } }],
            }),
            defineAction({
              name: 'reject',
              title: 'Send back with reason',
              filter: 'defined($fields.responder)',
              status: 'done',
              params: [{ type: 'string', name: 'reason', title: 'Reason', required: true }],
              ops: [
                { type: 'field.set', target: { field: 'rejectionReason' }, value: { type: 'param', param: 'reason' } },
              ],
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({ name: 'to-resolved', to: 'resolved', when: 'defined($fields.approvedBy)' }),
        defineTransition({ name: 'back-to-raised', to: 'raised', when: 'defined($fields.rejectionReason)' }),
      ],
    }),
    defineStage({ name: 'resolved', title: 'Resolved' }),
  ],
})

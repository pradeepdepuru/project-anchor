import {defineWorkflowConfig} from '@sanity/workflow-engine/define'

import {alertResponse} from './workflows/alert-response'

export default defineWorkflowConfig({
  deployments: [
    {
      name: 'production',
      tag: 'prod',
      // 10 is what the current quick start requires for a definition with a required subject.
      // If the CLI reports a different number, use that one.
      expectedMinReaderModel: 10,
      workflowResource: {type: 'dataset', id: 't3retdwe.production'},
      definitions: [alertResponse],
    },
  ],
})

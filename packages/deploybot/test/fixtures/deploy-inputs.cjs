module.exports = `
production:
  environment: production
  description: Deploy \${{ inputs.version }}
  payload:
    foo: bar
  inputs:
    version:
      description: Version to roll out
      required: true
    dry_run:
      type: boolean
      default: false
    region:
      type: choice
      options: [eu, us]
      default: eu
    replicas:
      type: number
`

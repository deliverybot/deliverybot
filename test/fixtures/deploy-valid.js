module.exports = `
review:
  auto_deploy_on: pr
  transient_environment: true
  production_environment: false
  required_contexts:
    - continuous-integration/travis-ci/push

  deployments:
  - environment: pr\${{ pr }}
    description: A test environment based on Docker
    auto_merge: false

canary:
  transient_environment: false
  production_environment: true
  required_contexts:
    - continuous-integration/travis-ci/push

  deployments:
  - environment: production
    description: A test environment based on Docker
    auto_merge: true
    payload:
      canary: 20%

production:
  auto_deploy_on: refs/tags/simple-tag
  transient_environment: false
  production_environment: true
  required_contexts:
    - continuous-integration/travis-ci/push

  deployments:
  - environment: production
    description: A test environment based on Docker
    auto_merge: true
    payload: {}

performance:
  transient_environment: false
  production_environment: true
  required_contexts:
    - continuous-integration/travis-ci/push

  deployments:
  - environment: performance
    description: A test environment based on Docker
    auto_merge: false
    payload: {}
`

module.exports = `
production:
  auto_deploy_on: refs/heads/changes
  environment: production
  description: A test environment based on Docker
  max_in_flight: 1
`

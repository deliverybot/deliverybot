# @deliverybot/app

This collects the core set of deliverybot applications into a single package.

## Conventions

All functionality is structured into apps which have the following files:

- `views`: Holds logic that calls queries and returns results to be formatted
  by the UI.
- `queries`: Queries the store for data.
- `store`: Storage in firebase or other mechanisms.
- `commands`: Commands mutate state.

The `@deliverybot/core` package contains all the main interfaces for working
with the application. It also collects together all dependencies needed for
applications.

Dependencies (like stores and csrf tokens) are passed through layers. This is
perhaps verbose but it provides for clear tracking and ability to reason about
instantiation easily.

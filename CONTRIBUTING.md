## Contributing

[fork]: /fork
[pr]: /compare
[code-of-conduct]: CODE_OF_CONDUCT.md

Hi there! We're thrilled that you'd like to contribute to this project. Your help is essential for keeping it great.

Please note that this project is released with a [Contributor Code of Conduct][code-of-conduct]. By participating in this project you agree to abide by its terms.

## Issues and PRs

If you have suggestions for how this project could be improved, or want to report a bug, open an issue! If you have questions, too, we'd love to hear them.

Pull requests that fix bugs are very welcome. If you're thinking of a larger change or a new feature, please open an issue first to talk about it. Look at the links below if you're not sure how to open a PR.

### AI-generated pull requests

Deliverybot itself is built with the help of AI coding tools (see the [README](README.md#a-note-on-how-this-revival-was-built)), so using them is fine. What we don't want are pull requests that are plain AI output: changes nobody has read, run or tested, opened without an issue or a clear reason, or descriptions that don't match the diff. They take more time to review than they save, and we'll close them.

If you use AI tools, you're responsible for the result. Understand every line you submit, test it, keep it focused, and be ready to answer questions about it.

## Submitting a pull request

1. [Fork][fork] and clone the repository.
1. Install the dependencies and build: `yarn install && yarn build`. See the [README](README.md#development) for the full development setup.
1. Make sure the tests pass on your machine: `yarn test`.
1. Create a new branch: `git checkout -b my-branch-name`.
1. Make your change, add tests, and make sure the tests still pass.
1. Push to your fork and [submit a pull request][pr].
1. Pat yourself on the back and wait for your pull request to be reviewed and merged.

Here are a few things you can do that will increase the likelihood of your pull request being accepted:

- Format your code with Prettier: `yarn format`.
- Write and update tests.
- Keep your changes as focused as possible. If there are multiple changes you would like to make that are not dependent upon each other, consider submitting them as separate pull requests.
- Write a [good commit message](http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html).

Work in Progress pull requests are also welcome to get feedback early on, or if something is blocking you.

## Resources

- [How to Contribute to Open Source](https://opensource.guide/how-to-contribute/)
- [Using Pull Requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests)
- [GitHub Help](https://docs.github.com)

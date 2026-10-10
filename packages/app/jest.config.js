module.exports = {
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  prettierPath: null,
  snapshotFormat: { escapeString: true, printBasicPrototype: true },
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  testRegex: '(/__tests__/.*|\\.(test|spec))\\.[tj]sx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
}

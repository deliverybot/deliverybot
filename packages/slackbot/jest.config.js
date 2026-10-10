module.exports = {
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  prettierPath: "../../node_modules/prettier",
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  testRegex: '(/__tests__/.*|\\.(test|spec))\\.[tj]sx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
}

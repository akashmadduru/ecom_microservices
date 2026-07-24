import defaultTheme from 'tailwindcss/defaultTheme'

module.exports = {
  theme: {
    extend: {
      fontFamily: {
        // Redefines the default global sans-serif stack
        sans: ['Quicksand', ...defaultTheme.fontFamily.sans],
      },
    },
  },
}

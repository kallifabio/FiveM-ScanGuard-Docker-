/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/index.html', './public/app.js'],
  theme: {
    extend: {
      colors: {
        base: '#100e17',
        panel: '#17141f',
        'panel-alt': '#1d1928',
        edge: '#2b2438',
        ink: '#eee9fb',
        muted: '#8d84a8',
        accent: '#9d5cff',
        'accent-dim': '#6c3fc9',
        critical: '#ff4d6d',
        high: '#ff9f43',
        medium: '#ffd166',
        low: '#6ec6ff',
        success: '#4ade80'
      },
      fontFamily: {
        ui: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      keyframes: {
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' }
        }
      },
      animation: { sweep: 'sweep 1.4s linear infinite' }
    }
  },
  plugins: []
};

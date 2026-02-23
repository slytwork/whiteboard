import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        chalk: '#f8fafc',
        board: '#081c15',
        boardMid: '#12372a',
        accent: '#84cc16',
        offense: '#fde68a',
        defense: '#93c5fd'
      }
    }
  },
  plugins: []
};

export default config;

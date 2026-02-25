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
        chalk: '#ffffff',
        board: '#000000',
        boardMid: '#111111',
        accent: '#ffffff',
        offense: '#ffffff',
        defense: '#71717a'
      }
    }
  },
  plugins: []
};

export default config;

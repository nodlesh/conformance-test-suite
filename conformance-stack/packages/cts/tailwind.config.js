/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/layouts/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'w-64',
    'py-4',
    'px-4',
    'text-white',
    'text-xl',
    'font-semibold',
    'rounded',
    'shadow-md',
    'transition',
    'transform',
    'bg-blue-500',
    'hover:bg-blue-600',
    'active:translate-y-1',
    'bg-green-500',
    'hover:bg-green-600',
    'bg-orange-500',
    'hover:bg-orange-600',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} 
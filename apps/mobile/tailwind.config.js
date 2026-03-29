/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef9ff",
          100: "#d9f1ff",
          200: "#bce7ff",
          300: "#8edaff",
          400: "#59c3ff",
          500: "#33a5ff",
          600: "#1b87f5",
          700: "#146fe1",
          800: "#1759b6",
          900: "#194c8f",
          950: "#142f57",
        },
        surface: {
          0: "#000000",
          50: "#0a0a0a",
          100: "#141414",
          200: "#1e1e1e",
          300: "#2d2d2d",
          400: "#3d3d3d",
        },
        success: "#22c55e",
        danger: "#ef4444",
        warning: "#f59e0b",
      },
      fontFamily: {
        sans: ["Inter_400Regular"],
        medium: ["Inter_500Medium"],
        semibold: ["Inter_600SemiBold"],
        bold: ["Inter_700Bold"],
        mono: ["JetBrainsMono_400Regular"],
      },
    },
  },
  plugins: [],
};

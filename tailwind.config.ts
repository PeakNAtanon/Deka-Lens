import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16212f",
        muted: "#536274",
        paper: "#f7f9fa",
        accent: "#176b67"
      }
    }
  },
  plugins: []
};

export default config;

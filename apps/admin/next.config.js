const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: false,
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

module.exports = nextConfig;

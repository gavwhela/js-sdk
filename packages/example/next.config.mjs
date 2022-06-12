/** @type {import('next').NextConfig} */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const nextConfig = {
  reactStrictMode: true,
  webpack: function (config, { buildId, dev, isServer, defaultLoaders, webpack }) {
    config.externals = config.externals || {}
    config.externals['styletron-server'] = 'styletron-server'
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        path: require.resolve("path-browserify"),
        stream: require.resolve("stream-browserify"),
        zlib: require.resolve("browserify-zlib"),
      }
      config.plugins.push(
        new webpack.ProvidePlugin({
          process: "process/browser",
        })
      );
    }
    return config
  },
}

export default nextConfig

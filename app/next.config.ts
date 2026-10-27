import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /seller/add is retired: new sales start at /sell, CSV import lives in /manage.
  async redirects() {
    return [{ source: "/seller/add", destination: "/sell", permanent: true }];
  },
  experimental: {
    // Publish sends downscaled photos as base64 through the server action;
    // a handful of ~200-400KB images can exceed the 1MB default.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;

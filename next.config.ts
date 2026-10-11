import type { NextConfig } from "next";

// STaR is mounted under /star on the Derby Control hub (PotatOS), which proxies /star/* to this
// deployment. basePath keeps every route and asset under that prefix on star.derbycontrol.co.uk
// too. Links already out in the world (the bare hostname, "/?i=<incident>" from Copy link, the
// old /index.html) redirect onto the prefix; the query string carries across.
const BASE_PATH = "/star";

const nextConfig: NextConfig = {
  agentRules: false,
  basePath: BASE_PATH,
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
  async redirects() {
    const temp = { basePath: false as const, permanent: false };
    return [
      { source: "/", destination: BASE_PATH, ...temp },
      { source: "/index.html", destination: BASE_PATH, ...temp },
      { source: "/storage-bridge.html", destination: `${BASE_PATH}/storage-bridge.html`, ...temp },
    ];
  },
};

export default nextConfig;

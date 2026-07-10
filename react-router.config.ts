import type { Config } from "@react-router/dev/config";

export default {
  // Static SPA — deployed to Cloudflare Pages, no server
  ssr: false,
} satisfies Config;

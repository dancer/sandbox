import { bridge } from "@cloudflare/sandbox/bridge";

export { Sandbox } from "@cloudflare/sandbox";
export { WarmPool } from "@cloudflare/sandbox/bridge";

export default bridge({
  fetch: () => new Response("ok"),
});

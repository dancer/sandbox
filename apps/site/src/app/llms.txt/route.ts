import { llmsIndex } from "@/lib/llms";

export const dynamic = "force-static";

export const GET = (): Response =>
  new Response(llmsIndex(), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

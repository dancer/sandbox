import { docs, findDoc } from "@/lib/llms";

export const dynamic = "force-static";
export const dynamicParams = false;

export const generateStaticParams = (): { slug: string }[] =>
  docs.map((doc) => ({ slug: `${doc.slug}.md` }));

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> => {
  const { slug } = await params;
  const name = slug.endsWith(".md") ? slug.slice(0, -3) : slug;
  const doc = findDoc(name);

  if (!doc) {
    return new Response("not found", { status: 404 });
  }

  return new Response(doc.body, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};

import type { Preview } from "@sandbox-sdk/core";

export const requestPreview = async (
  preview: Preview,
  path = "/"
): Promise<Response> => {
  let cause: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await preview.request(path);
      if (response.ok) {
        return response;
      }
      cause = new Error(`preview responded ${response.status}`);
    } catch (error) {
      cause = error;
    }
    await Bun.sleep(1000);
  }

  throw new Error("preview did not become reachable", { cause });
};

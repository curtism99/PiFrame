export async function fetchManifest() {
  const response = await fetch("/api/manifest", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Manifest request failed: ${response.status}`);
  }
  return response.json();
}

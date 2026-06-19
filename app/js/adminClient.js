export async function fetchRuntimeMode() {
  const response = await fetch("/api/mode", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Mode request failed: ${response.status}`);
  }
  return response.json();
}

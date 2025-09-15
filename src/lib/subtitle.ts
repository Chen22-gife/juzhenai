export async function grabYoutubeTranscript(url: string): Promise<{text:string; srt?:string}> {
  const r = await fetch("/api/subtitle/grab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j.message || `grab failed: ${r.status}`);
  return { text: j.text, srt: j.srt };
}

export async function asrTranscript(url: string, provider: "openai", apiKey: string, model?: string): Promise<{text:string; srt?:string}> {
  const r = await fetch("/api/subtitle/asr", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-provider": provider, "x-api-key": apiKey },
    body: JSON.stringify({ url, model })
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j.message || `asr failed: ${r.status}`);
  return { text: j.text, srt: j.srt };
}

import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.mjs";
import mammoth from "mammoth";

export async function extractTextFromFile(file: File): Promise<string> {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("text/") || file.name.toLowerCase().endsWith(".txt")) {
    return await file.text();
  }
  if (t.includes("word") || file.name.toLowerCase().endsWith(".docx")) {
    const arrayBuffer = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer });
    return res.value || "";
  }
  if (t.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((it: any) => it.str);
      text += strings.join(" ") + "\n";
    }
    return text;
  }
  throw new Error("暂不支持的文件类型，请先复制纯文本。");
}

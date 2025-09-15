import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  downloadBlob(filename.endsWith(".md") ? filename : filename + ".md", blob);
}

export async function exportDocx(args: {
  filename: string;
  title?: string;
  segments?: Record<string, string>; // 多段
  content?: string;                   // 单段
}) {
  const children: Paragraph[] = [];
  if (args.title) {
    children.push(new Paragraph({ text: args.title, heading: HeadingLevel.HEADING_1, spacing: { after: 240 } }));
  }
  if (args.segments && Object.keys(args.segments).length) {
    for (const [k, v] of Object.entries(args.segments)) {
      children.push(new Paragraph({ text: String(k), heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }));
      v.split(/\n/).forEach(line => {
        children.push(new Paragraph({ children: [new TextRun(line)] }));
      });
    }
  } else if (args.content) {
    args.content.split(/\n/).forEach(line => {
      children.push(new Paragraph({ children: [new TextRun(line)] }));
    });
  } else {
    children.push(new Paragraph({ text: "（空文档）" }));
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  downloadBlob(args.filename.endsWith(".docx") ? args.filename : args.filename + ".docx", blob);
}

// 将某个容器（含渲染后的 HTML）导出为 A4 PDF
export async function exportPDFByElementId(filename: string, elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) throw new Error("未找到导出区域：" + elementId);
  const canvas = await html2canvas(el as HTMLElement, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({ unit: "pt", format: "a4" }); // 595×842 pt
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = canvas.height * (imgWidth / canvas.width);

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    pdf.addPage();
    position = -(imgHeight - heightLeft);
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  pdf.save(filename.endsWith(".pdf") ? filename : filename + ".pdf");
}

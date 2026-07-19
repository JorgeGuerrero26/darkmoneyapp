/**
 * Mini-parser de negritas para las burbujas del asistente: el modelo marca
 * montos/totales con **texto** y la burbuja lo renderiza en bold real.
 * Solo negritas a propósito (nada de #, ---, tablas): puro y testeable.
 */

export type AssistantTextSegment = {
  text: string;
  bold: boolean;
};

export function parseBoldSegments(text: string): AssistantTextSegment[] {
  const segments: AssistantTextSegment[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false });
  }
  return segments.length > 0 ? segments : [{ text, bold: false }];
}

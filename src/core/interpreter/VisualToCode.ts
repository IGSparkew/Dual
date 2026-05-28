export interface VisualToCode {
  apply(currentCode: string, transform: (ast: unknown) => unknown): string;
}

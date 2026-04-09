declare module 'asciichart' {
  export const blue: string;
  export const green: string;
  export const red: string;
  export const yellow: string;
  export const cyan: string;
  export const magenta: string;

  export function plot(
    series: number[] | number[][],
    config?: {
      height?: number;
      padding?: string;
      format?: (x: number) => string;
      colors?: string[];
      min?: number;
      max?: number;
    }
  ): string;
}

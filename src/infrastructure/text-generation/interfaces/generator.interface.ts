export interface ITextGenerator {
  generate(
    instructions: string,
    input: string,
    signal?: AbortSignal,
  ): Promise<string>;
}

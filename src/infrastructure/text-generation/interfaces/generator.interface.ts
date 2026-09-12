export interface ITextGenerator {
  generate(instructions: string, input: string): Promise<string>;
}

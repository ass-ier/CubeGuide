declare module 'cubejs' {
  export default class Cube {
    constructor();
    static initSolver(): void;
    static fromString(facelets: string): Cube;
    static random(): Cube;
    asString(): string;
    move(algorithm: string): Cube;
    solve(maxDepth?: number): string;
    isSolved(): boolean;
  }
}

declare module 'web3.storage' {
  export class Web3Storage {
    constructor(options: any)
    put(files: any[], options?: any): Promise<string>
  }
}

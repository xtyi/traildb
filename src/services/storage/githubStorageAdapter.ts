import type { FootprintStateV1 } from "@/shared/types/footprint";
import type { StorageAdapter } from "@/services/storage/storageAdapter";

export interface GitHubStorageConfig {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

export class GitHubStorageAdapter implements StorageAdapter {
  constructor(private readonly config: GitHubStorageConfig) {}

  async load(): Promise<FootprintStateV1 | null> {
    throw new Error(`GitHubStorageAdapter.load is not implemented yet for ${this.config.owner}/${this.config.repo}`);
  }

  async save(_state: FootprintStateV1): Promise<void> {
    throw new Error(`GitHubStorageAdapter.save is not implemented yet for ${this.config.owner}/${this.config.repo}`);
  }

  async clear(): Promise<void> {
    throw new Error(`GitHubStorageAdapter.clear is not implemented yet for ${this.config.owner}/${this.config.repo}`);
  }
}

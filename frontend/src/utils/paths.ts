/**
 * Encode a local path using Claude's format.
 *
 * Replaces slashes and underscores with dashes.
 * e.g., /home/user/projects/my_app -> -home-user-projects-my-app
 *
 * This mirrors the backend's encode_path() function in storage.py.
 */
export function encodeRepoPath(localPath: string): string {
  return localPath.replace(/[/_]/g, '-');
}

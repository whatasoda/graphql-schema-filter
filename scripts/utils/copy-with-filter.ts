import fg from "fast-glob";
import { mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function copyWithFilter({
  patterns,
  dest,
  cwd = process.cwd(),
}: {
  patterns: string[];
  dest: string;
  cwd?: string;
}) {
  const entries = await fg(patterns, {
    cwd,
    onlyFiles: true,
    dot: false,
  });

  for (const relPath of entries) {
    const srcAbs = resolve(cwd, relPath);
    const destAbs = resolve(dest, relPath);

    // コピー先ディレクトリを作成
    await mkdir(dirname(destAbs), { recursive: true });

    // ファイルコピー
    await copyFile(srcAbs, destAbs);
  }
}

import { execFile } from 'node:child_process';
import { join } from 'node:path';

// Runs the read-only assistant query (public.naver + nearest station) for one request.
export function runAssistant(root, filters) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.env.TEOJABI_PYTHON || 'C:/Users/yoon/AppData/Local/Programs/Python/Python310/python.exe',
      ['-X', 'utf8', join(root, 'automation/assistant.py')],
      { windowsHide: true, timeout: 30000, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        try {
          const result = JSON.parse(stdout);
          if (error && result.status !== 'ready') reject(new Error('ASSISTANT_UNAVAILABLE'));
          else resolve(result);
        } catch {
          reject(new Error('ASSISTANT_UNAVAILABLE'));
        }
      },
    );
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(filters || {}));
  });
}

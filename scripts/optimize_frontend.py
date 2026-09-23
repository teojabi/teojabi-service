#!/usr/bin/env python3
"""GitHub Pages용 정적 프론트엔드 최적화 스크립트.

- JS/CSS를 esbuild로 최소화(minify)한다.
- 모든 상대 자산 참조에 캐시 버전(?v=<commit sha>)을 부여한다.
  (정적 import / 동적 import / re-export, HTML의 link·script 모두)

사용: python3 scripts/optimize_frontend.py <src_dir> <dst_dir> <version>
"""
import os
import re
import shutil
import subprocess
import sys

ASSET_EXT = ('.mjs', '.js', '.css')
# './name.mjs', './name.css', './name.js' (+ 기존 ?v=...)
REF = re.compile(
    r"(?P<q>[\"'])\./(?P<path>[A-Za-z0-9_./-]+\.(?:mjs|css|js))(?:\?v=[A-Za-z0-9_.-]+)?(?P=q)"
)
REWRITE_EXT = ('.mjs', '.js', '.html')


def minify(path):
    tmp = path + '.min'
    subprocess.run(['esbuild', path, '--minify', '--legal-comments=none', '--outfile=' + tmp],
                   check=True, capture_output=True)
    os.replace(tmp, path)


def rewrite(path, version):
    text = open(path, encoding='utf-8').read()
    new = REF.sub(lambda m: f"{m.group('q')}./{m.group('path')}?v={version}{m.group('q')}", text)
    if new != text:
        open(path, 'w', encoding='utf-8').write(new)
        return True
    return False


def main():
    src, dst, version = sys.argv[1], sys.argv[2], sys.argv[3]
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    for root, _dirs, files in os.walk(dst):
        for name in files:
            if os.path.splitext(name)[1].lower() in ASSET_EXT:
                minify(os.path.join(root, name))
    changed = 0
    for root, _dirs, files in os.walk(dst):
        for name in files:
            if os.path.splitext(name)[1].lower() in REWRITE_EXT:
                changed += rewrite(os.path.join(root, name), version)
    print(f"optimized dst={dst} version={version} rewrittenFiles={changed}")


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""GitHub Pages용 정적 프론트엔드 최적화 스크립트.

- JS/CSS를 esbuild로 최소화(minify)한다.
- 모든 상대 자산 참조에 캐시 버전(?v=<commit sha>)을 부여한다.
  - JS: 정적 import / 동적 import / re-export (.mjs, .css, .js)
  - HTML: link/script/img 등 (.mjs, .css, .js + 이미지)

사용: python3 scripts/optimize_frontend.py <src_dir> <dst_dir> <version>
"""
import os
import re
import shutil
import subprocess
import sys

ASSET_EXT = ('.mjs', '.js', '.css')
IMG_EXT = 'png|webp|ico|svg|jpg|jpeg|gif'
# JS 모듈 참조 (코드 자산만)
JS_REF = re.compile(
    r"(?P<q>[\"'])\./(?P<path>[A-Za-z0-9_./-]+\.(?:mjs|css|js))(?:\?v=[A-Za-z0-9_.-]+)?(?P=q)"
)
# HTML 참조 (코드 + 이미지)
HTML_REF = re.compile(
    r"(?P<q>[\"'])\./(?P<path>[A-Za-z0-9_./-]+\.(?:mjs|css|js|" + IMG_EXT + r"))(?:\?v=[A-Za-z0-9_.-]+)?(?P=q)"
)


def minify(path):
    tmp = path + '.min'
    subprocess.run(['esbuild', path, '--minify', '--legal-comments=none', '--outfile=' + tmp],
                   check=True, capture_output=True)
    os.replace(tmp, path)


def rewrite(path, pattern, version):
    text = open(path, encoding='utf-8').read()
    new = pattern.sub(lambda m: f"{m.group('q')}./{m.group('path')}?v={version}{m.group('q')}", text)
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
            path = os.path.join(root, name)
            ext = os.path.splitext(name)[1].lower()
            if ext in ('.mjs', '.js'):
                changed += rewrite(path, JS_REF, version)
            elif ext == '.html':
                changed += rewrite(path, HTML_REF, version)
    print(f"optimized dst={dst} version={version} rewrittenFiles={changed}")


if __name__ == '__main__':
    main()

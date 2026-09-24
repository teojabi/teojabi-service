#!/usr/bin/env python3
"""GitHub Pages용 정적 프론트엔드 최적화 스크립트.

- JS/CSS를 esbuild로 최소화(minify)한다.
- 모든 상대 자산 참조에 캐시 버전(?v=<commit sha>)을 부여한다.
  - JS: 정적 import / 동적 import / re-export (.mjs, .css, .js)
  - HTML: link/script/img 등 (.mjs, .css, .js + 이미지)
- version.json 을 만들고 각 HTML에 자동 갱신 가드를 심는다.
  - 브라우저가 예전 HTML을 캐시하고 있어도, 새 배포가 있으면 스스로 최신 HTML을 받아온다.

사용: python3 scripts/optimize_frontend.py <src_dir> <dst_dir> <version>
"""
import json
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


# 캐시된 HTML이라도 새 배포가 있으면 자동으로 최신 HTML을 받도록 하는 인라인 가드.
# version.json 을 캐시 우회로 확인해 버전이 다르면 ?_v=<버전> 을 붙여 새 HTML을 강제 로드한다.
# (app.mjs 가 아니라 HTML 안 인라인이라, JS가 캐시돼 있어도 동작한다)
GUARD_TEMPLATE = (
    '<meta name="teojabi-build" content="__VERSION__">'
    '<script>(function(){var v="__VERSION__";'
    'fetch("./version.json?ts="+Date.now(),{cache:"no-store"})'
    '.then(function(r){return r.ok?r.json():null;})'
    '.then(function(d){'
    'if(!d||!d.version)return;'
    'var u=new URL(location.href);'
    'if(d.version===v){'
    'if(u.searchParams.has("_v")){u.searchParams.delete("_v");history.replaceState(null,"",u.toString());}'
    'return;'
    '}'
    'if(u.searchParams.get("_v")===d.version)return;'
    'u.searchParams.set("_v",d.version);'
    'location.replace(u.toString());'
    '})'
    '.catch(function(){});'
    '})();</script>'
)


def inject_guard(path, version):
    text = open(path, encoding='utf-8').read()
    if 'teojabi-build' in text:
        return False
    marker = '<head>'
    idx = text.find(marker)
    if idx == -1:
        return False
    guard = GUARD_TEMPLATE.replace('__VERSION__', version)
    open(path, 'w', encoding='utf-8').write(text[:idx + len(marker)] + guard + text[idx + len(marker):])
    return True


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
    # 배포 버전을 기록하고, 각 HTML에 자동 갱신 가드를 심는다.
    with open(os.path.join(dst, 'version.json'), 'w', encoding='utf-8') as handle:
        json.dump({'version': version}, handle)
    guarded = 0
    for root, _dirs, files in os.walk(dst):
        for name in files:
            if os.path.splitext(name)[1].lower() == '.html':
                guarded += inject_guard(os.path.join(root, name), version)
    print(f"optimized dst={dst} version={version} rewrittenFiles={changed} guardedHtml={guarded}")


if __name__ == '__main__':
    main()

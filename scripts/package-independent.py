"""Package a clean committed static frontend for the independent Tencent origin."""
import argparse
import gzip
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile
from pathlib import Path

ORIGIN = 'https://nsp-wiki.shiaoming.cn'
OLD_ORIGINS = ('https://nsp.henshiaoming.chatgpt.site', 'https://nsp-wiki.netlify.app')
FILING = '<a class="independent-filing" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:8px 12px;font-size:12px;color:inherit">京ICP备2026047867号-1</a>'
EXTENSIONS = {'.html', '.css', '.js', '.json', '.xml', '.txt', '.png', '.webp', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.gz'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def prepare(client, output, *, release, sourceCommit):
    if not isinstance(release, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,99}', release):
        raise ValueError('Release must be a safe 1-100 character archive identifier')
    if not isinstance(sourceCommit, str) or not re.fullmatch(r'[a-fA-F0-9]{40}', sourceCommit):
        raise ValueError('Source commit must be a full 40-hex Git commit')
    client, output = Path(client).absolute(), Path(output).absolute()
    if client.is_symlink() or client.is_junction():
        raise ValueError('Linked client root')
    if output.exists() or output.is_symlink():
        raise ValueError('Preserve existing output')
    client, output = client.resolve(), output.resolve()
    if output == client or client in output.parents or output in client.parents:
        raise ValueError('Output must be outside the built client tree')
    if not (client / 'index.html').is_file():
        raise ValueError('Build dist/client before packaging')
    files = {}
    for path in sorted(client.rglob('*')):
        if path.is_symlink() or path.is_junction():
            raise ValueError('Linked input: ' + str(path))
        if not path.is_file():
            continue
        name = path.relative_to(client).as_posix()
        # These files configure other hosts; Nginx does not interpret them.
        if name in {'_headers', '_redirects', '.assetsignore'} or name.startswith('.vite/'):
            continue
        if any(part.startswith('.') for part in path.relative_to(client).parts) or (path.suffix not in EXTENSIONS and path.name not in {'LICENSE', 'NOTICE'}) or name.split('/')[0] in {'api', 'node_modules', 'server'} or name.startswith('mirror/edge-functions/') or name == 'mirror/proxy.js' or re.search(r'(^|/)(accounts|sessions|credentials|secrets)([./]|$)', name, re.I):
            raise ValueError('Unexpected static file: ' + name)
        data = path.read_bytes()
        if path.suffix in {'.html', '.xml', '.txt'}:
            text = data.decode('utf-8')
            for origin in OLD_ORIGINS:
                text = text.replace(origin, ORIGIN)
            if path.suffix == '.html' and '</body>' in text:
                if 'rel="canonical"' in text and name != '404.html':
                    text = text.replace('content="noindex,follow"', 'content="index,follow,max-image-preview:large"')
                if '京ICP备2026047867号-1' not in text:
                    end = '</footer>' if '</footer>' in text else '</body>'
                    text = text.replace(end, FILING + end, 1)
            data = text.encode('utf-8')
        if path.suffix in {'.html', '.js', '.json', '.xml', '.txt', '.css'} and any(origin.encode() in data for origin in OLD_ORIGINS):
            raise ValueError('Old runtime origin: ' + name)
        files[name] = data
    for required in ('index.html', '404.html', 'sitemap.xml', 'robots.txt', 'community-auth.js'):
        if required not in files:
            raise ValueError('Missing static entry: ' + required)
    if 'noindex' not in files['404.html'].decode():
        raise ValueError('Keep 404 noindex')
    if b"fetch('/api/'" not in files['community-auth.js'] or b"credentials:'same-origin'" not in files['community-auth.js']:
        raise ValueError('Independent API contract changed')
    if '旧用户请重新注册'.encode() not in files['community-auth.js']:
        raise ValueError('Missing independent account notice')
    archive_name = 'independent-' + release + '.tar.gz'
    info = {'release': release, 'sourceCommit': sourceCommit, 'archiveName': archive_name,
            'canonicalOrigin': ORIGIN, 'mode': 'independent-same-origin',
            'communityApi': '/api/', 'requiresApiActivation': True,
            'accountMode': 'preserve-independent-accounts', 'legacyAccountsMigrated': False,
            'adapterSHA256': digest(Path(__file__).read_bytes()),
            'sourceChangeSHA256': os.environ.get('NSP_SOURCE_CHANGE_SHA256')}
    files['nsp-release.json'] = (json.dumps(info, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()
    output.mkdir(parents=True)
    public = output / 'public'
    for name, data in files.items():
        target = public / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    manifest = {**info, 'files': len(files), 'bytes': sum(map(len, files.values())),
                'sha256': {name: digest(data) for name, data in sorted(files.items())}}
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + '\n', encoding='utf-8', newline='\n')
    archive = output / archive_name
    with archive.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed, tarfile.open(fileobj=compressed, mode='w', format=tarfile.PAX_FORMAT) as tar:
        for name, data in sorted(files.items()):
            entry = tarfile.TarInfo(name)
            entry.size, entry.mode, entry.mtime = len(data), 0o644, 0
            tar.addfile(entry, io.BytesIO(data))
    archive_hash = digest(archive.read_bytes())
    (output / 'archive-sha256.txt').write_text(archive_hash + '\n', encoding='ascii')
    return {'files': len(files), 'bytes': manifest['bytes'], 'archiveName': archive_name, 'archiveSHA256': archive_hash}


def source_commit(root):
    head = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    if not re.fullmatch(r'[a-fA-F0-9]{40}', head):
        raise ValueError('Git HEAD must be a full 40-hex commit')
    if subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain=v1', '--untracked-files=all'], text=True).strip():
        raise ValueError('Source must be clean: commit tracked and untracked source changes before packaging')
    return head


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', help='absolute new output directory')
    parser.add_argument('--release', required=True, help='actual release identifier; archive uses the same value')
    args = parser.parse_args(argv)
    root = Path(__file__).resolve().parents[1]
    if not Path(args.output).is_absolute():
        raise SystemExit('Output must be absolute')
    head = source_commit(root)
    print(json.dumps(prepare(root / 'dist/client', Path(args.output), release=args.release, sourceCommit=head), sort_keys=True))


if __name__ == '__main__':
    main()

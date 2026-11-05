"""Synthetic checks; never use production credentials, accounts or uploads."""
import importlib.util
import hashlib
import json
import re
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
from xml.etree import ElementTree

spec = importlib.util.spec_from_file_location('package_independent', Path(__file__).with_name('package-independent.py'))
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


def verify(output):
    output = Path(output)
    public = output / 'public'
    manifest = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))
    expected = manifest['sha256']
    actual = {p.relative_to(public).as_posix() for p in public.rglob('*') if p.is_file()}
    assert actual == set(expected), 'Static file set differs'
    assert len(expected) == manifest['files']
    for name, sha in expected.items():
        assert hashlib.sha256((public / name).read_bytes()).hexdigest() == sha, name
    assert re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,99}', manifest['release']), 'Unsafe release identity'
    assert re.fullmatch(r'[a-fA-F0-9]{40}', manifest['sourceCommit']), 'Invalid source commit'
    assert manifest['archiveName'] == 'independent-' + manifest['release'] + '.tar.gz'
    release_info = json.loads((public / 'nsp-release.json').read_text(encoding='utf-8'))
    assert release_info == {key: manifest[key] for key in release_info}, 'Release identity differs from manifest'
    archive = output / manifest['archiveName']
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == (output / 'archive-sha256.txt').read_text().strip()
    seen = set()
    with tarfile.open(archive, 'r:gz') as tar:
        for entry in tar:
            assert entry.name in expected and entry.name not in seen and entry.isfile(), entry.name
            assert entry.mtime == 0 and entry.mode == 0o644
            assert hashlib.sha256(tar.extractfile(entry).read()).hexdigest() == expected[entry.name], entry.name
            seen.add(entry.name)
    assert seen == set(expected)

    class Links(HTMLParser):
        def __init__(self):
            super().__init__()
            self.links, self.canonical = [], []

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag in {'a', 'link', 'script', 'img'}:
                value = attrs.get('href') or attrs.get('src')
                if value:
                    self.links.append(value)
            if tag == 'link' and attrs.get('rel') == 'canonical':
                self.canonical.append(attrs.get('href'))

    def exists(url):
        target = urlsplit(url)
        if target.netloc != urlsplit(package.ORIGIN).netloc or target.scheme not in {'http', 'https'} or target.path.startswith('/api/'):
            return
        name = unquote(target.path).lstrip('/')
        if name.endswith('/') or not name:
            name += 'index.html'
        assert name in expected or name + '/index.html' in expected, url

    pages = links = noindex = 0
    for name in expected:
        if not name.endswith('.html'):
            continue
        text = (public / name).read_text(encoding='utf-8')
        if '</body>' not in text:
            continue
        pages += 1
        assert '京ICP备2026047867号-1' in text, name
        parser = Links()
        parser.feed(text)
        assert all(value.startswith(package.ORIGIN + '/') for value in parser.canonical), name
        if not parser.canonical:
            assert 'noindex' in text, name
            noindex += 1
        for value in parser.links:
            exists(urljoin(package.ORIGIN + '/' + name, value))
            links += 1
    sitemap = ElementTree.fromstring((public / 'sitemap.xml').read_bytes())
    locations = [e.text for e in sitemap.iter() if e.tag.endswith('loc')]
    for value in locations:
        assert value.startswith(package.ORIGIN + '/')
        exists(value)
    return {'status': 'PASS', 'files': len(expected), 'htmlPages': pages, 'linksChecked': links,
            'sitemapURLs': len(locations), 'intentionalNoindexPages': noindex,
            'archiveEntriesAndHashes': 'PASS'}


class PackageCheck(unittest.TestCase):
    def test_archive_only_repeats_all_bytes_without_public_tree(self):
        first = package.prepare(self.client, self.root / 'materialized', release='repeat', sourceCommit='a' * 40)
        second = package.prepare(self.client, self.root / 'archive-only', release='repeat', sourceCommit='a' * 40, materialize=False)
        self.assertEqual(first, second)
        self.assertFalse((self.root / 'archive-only/public').exists())
        for name in ('manifest.json', first['archiveName'], 'archive-sha256.txt'):
            self.assertEqual((self.root / 'materialized' / name).read_bytes(), (self.root / 'archive-only' / name).read_bytes())
        (self.client / 'robots.txt').write_text('changed input', encoding='utf-8')
        changed = package.prepare(self.client, self.root / 'changed', release='repeat', sourceCommit='a' * 40, materialize=False)
        self.assertNotEqual(first['archiveSHA256'], changed['archiveSHA256'])

    def test_invalid_compression_options_rejected_before_output(self):
        for options in ({'materialize': 0}, {'compresslevel': True}, {'compresslevel': -1}, {'compresslevel': 10}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                package.prepare(self.client, self.root / 'invalid', release='repeat', sourceCommit='a' * 40, **options)
        self.assertFalse((self.root / 'invalid').exists())

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.client = self.root / 'client'
        self.client.mkdir()
        for name, value in {
            'index.html': '<html><head><link rel="canonical" href="https://nsp.henshiaoming.chatgpt.site/"><meta name="robots" content="noindex,follow"></head><body><footer></footer></body></html>',
            '404.html': '<meta name="robots" content="noindex,follow"><body></body>',
            'sitemap.xml': '<loc>https://nsp.henshiaoming.chatgpt.site/</loc>',
            'robots.txt': 'Sitemap: https://nsp.henshiaoming.chatgpt.site/sitemap.xml',
            'community-auth.js': "fetch('/api/'+path,{credentials:'same-origin'}); // 旧用户请重新注册",
            '_headers': 'Netlify settings',
            'LICENSE': 'Synthetic dependency license',
        }.items():
            (self.client / name).write_text(value, encoding='utf-8')

    def test_deterministic_and_host_contract(self):
        first = package.prepare(self.client, self.root / 'a', release='synthetic-release', sourceCommit='a' * 40)
        second = package.prepare(self.client, self.root / 'b', release='synthetic-release', sourceCommit='a' * 40)
        self.assertEqual(first, second)
        self.assertEqual((self.root / 'a/manifest.json').read_bytes(), (self.root / 'b/manifest.json').read_bytes())
        public = self.root / 'a/public'
        self.assertFalse((public / '_headers').exists())
        self.assertTrue((public / 'LICENSE').exists())
        self.assertIn(package.FILING, (public / 'index.html').read_text(encoding='utf-8'))
        self.assertIn('noindex', (public / '404.html').read_text(encoding='utf-8'))
        self.assertNotIn('noindex', (public / 'index.html').read_text(encoding='utf-8'))
        self.assertEqual(json.loads((public / 'nsp-release.json').read_text())['communityApi'], '/api/')
        self.assertEqual(json.loads((public / 'nsp-release.json').read_text())['accountMode'], 'preserve-independent-accounts')
        self.assertEqual(json.loads((public / 'nsp-release.json').read_text())['release'], 'synthetic-release')
        self.assertEqual(json.loads((public / 'nsp-release.json').read_text())['sourceCommit'], 'a' * 40)
        self.assertEqual(verify(self.root / 'a')['status'], 'PASS')
        (public / 'robots.txt').write_text('tampered')
        with self.assertRaises(AssertionError):
            verify(self.root / 'a')
        with self.assertRaises(ValueError):
            package.prepare(self.client, self.root / 'a', release='synthetic-release', sourceCommit='a' * 40)

    def test_private_or_unexpected_files_rejected(self):
        for name in ('.env', 'accounts.sqlite', 'accounts.json', 'sessions.json', 'source.sql', 'private.pem', 'mirror.js.map'):
            with self.subTest(name=name):
                secret = self.client / name
                secret.write_text('synthetic forbidden fixture')
                with self.assertRaises(ValueError):
                    package.prepare(self.client, self.root / 'bad', release='synthetic-release', sourceCommit='a' * 40)
                secret.unlink()
        self.assertFalse((self.root / 'bad').exists())

    def test_external_runtime_origin_rejected(self):
        (self.client / 'bad.js').write_text("fetch('https://nsp.henshiaoming.chatgpt.site/api/auth/session')")
        with self.assertRaises(ValueError):
            package.prepare(self.client, self.root / 'bad', release='synthetic-release', sourceCommit='a' * 40)

    def test_missing_registration_notice_rejected(self):
        (self.client / 'community-auth.js').write_text("fetch('/api/'+path,{credentials:'same-origin'});")
        with self.assertRaises(ValueError):
            package.prepare(self.client, self.root / 'bad', release='synthetic-release', sourceCommit='a' * 40)

    def test_nested_output_rejected(self):
        with self.assertRaises(ValueError):
            package.prepare(self.client, self.client / 'output', release='synthetic-release', sourceCommit='a' * 40)

    def test_game_mirror_guide_preserved_but_edge_rejected(self):
        guide = self.client / 'mirror/index.html'
        guide.parent.mkdir()
        guide.write_text('<meta name="robots" content="noindex,follow"><body>镜柜攻略</body>', encoding='utf-8')
        package.prepare(self.client, self.root / 'guide', release='synthetic-release', sourceCommit='a' * 40)
        self.assertTrue((self.root / 'guide/public/mirror/index.html').exists())
        edge = self.client / 'mirror/edge-functions/community.js'
        edge.parent.mkdir()
        edge.write_text('synthetic proxy fixture')
        with self.assertRaises(ValueError):
            package.prepare(self.client, self.root / 'bad', release='synthetic-release', sourceCommit='a' * 40)

    def test_linked_input_rejected(self):
        target = self.root / 'outside.json'
        target.write_text('{}')
        link = self.client / 'linked.json'
        try:
            link.symlink_to(target)
        except OSError:
            self.skipTest('Creating symbolic links is unavailable')
        with self.assertRaises(ValueError):
            package.prepare(self.client, self.root / 'bad', release='synthetic-release', sourceCommit='a' * 40)

    def test_explicit_safe_release_and_commit(self):
        with self.assertRaises(TypeError):
            package.prepare(self.client, self.root / 'missing')
        for release in ('', '../escape', '/absolute', 'bad/name', 'bad\\name', 'bad space', '.', 'a' * 101):
            with self.subTest(release=release), self.assertRaises(ValueError):
                package.prepare(self.client, self.root / 'bad', release=release, sourceCommit='a' * 40)
        for commit in ('', 'HEAD', 'a' * 39, 'a' * 41, 'g' * 40):
            with self.subTest(commit=commit), self.assertRaises(ValueError):
                package.prepare(self.client, self.root / 'bad', release='safe-release', sourceCommit=commit)
        self.assertFalse((self.root / 'bad').exists())

    def test_clean_head_required(self):
        with patch.object(package.subprocess, 'check_output', side_effect=['b' * 40 + '\n', '']) as git:
            self.assertEqual(package.source_commit(self.root), 'b' * 40)
            self.assertEqual(git.call_args_list[1].args[0][-3:], ['status', '--porcelain=v1', '--untracked-files=all'])
        for status in (' M source.js\n', 'M  source.js\n', '?? new-source.js\n'):
            with self.subTest(status=status), patch.object(package.subprocess, 'check_output', side_effect=['b' * 40, status]), self.assertRaises(ValueError):
                package.source_commit(self.root)
        with patch.object(package.subprocess, 'check_output', return_value='not-a-commit'), self.assertRaises(ValueError):
            package.source_commit(self.root)

    def test_manifest_archive_identity_rejected(self):
        output = self.root / 'identity'
        package.prepare(self.client, output, release='synthetic-release', sourceCommit='a' * 40)
        original = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))
        for field, value in [('archiveName', 'other.tar.gz'), ('release', '../escape'), ('sourceCommit', 'HEAD')]:
            with self.subTest(field=field):
                (output / 'manifest.json').write_text(json.dumps({**original, field: value}), encoding='utf-8')
                with self.assertRaises(AssertionError):
                    verify(output)

    def test_cli_requires_release_and_passes_head(self):
        with self.assertRaises(SystemExit), patch.object(package, 'source_commit') as head:
            package.main([str(self.root / 'cli')])
        head.assert_not_called()
        with patch.object(package, 'source_commit', return_value='b' * 40), patch.object(package, 'prepare', return_value={'status': 'synthetic'}) as prepare, patch('builtins.print'):
            package.main([str(self.root / 'cli'), '--release', 'actual-release'])
        self.assertEqual(prepare.call_args.kwargs, {'release': 'actual-release', 'sourceCommit': 'b' * 40})


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--package':
        print(json.dumps(verify(sys.argv[2]), sort_keys=True))
    else:
        unittest.main()

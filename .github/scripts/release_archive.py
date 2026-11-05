"""Publish a manifest-verified archive from the exact public tag; no production access."""
import gzip,hashlib,json,os,re,shutil,subprocess,tarfile
from pathlib import Path,PurePosixPath

def digest(data):return hashlib.sha256(data).hexdigest()
def command(*args,**kwargs):return subprocess.check_output(args,stderr=subprocess.PIPE,**kwargs)
def build(root,commit,tag,output):
    if not re.fullmatch(r'[a-f0-9]{40}',commit) or not re.fullmatch(r'wiki-[A-Za-z0-9][A-Za-z0-9._-]{0,99}',tag):raise ValueError('Invalid immutable publication identity')
    if command('git','-C',str(root),'rev-parse','HEAD').decode().strip()!=commit:raise ValueError('Checkout differs from event commit')
    raw=command('git','-C',str(root),'show',commit+':PUBLIC-EXPORT.json');manifest=json.loads(raw)
    if tag!='wiki-'+manifest['release'] or not re.fullmatch(r'[a-f0-9]{40}',manifest['sourceCommit']):raise ValueError('Tag differs from exported live release')
    expected={**manifest['files'],'PUBLIC-EXPORT.json':digest(raw)}
    for name,h in expected.items():
        p=PurePosixPath(name)
        if p.is_absolute() or '..' in p.parts or '\\' in name or not re.fullmatch(r'[a-f0-9]{64}',h):raise ValueError('Unsafe export entry')
    output.mkdir(parents=True,exist_ok=False);archive=output/('nsp-wiki-'+manifest['release']+'.tar.gz')
    with subprocess.Popen(['git','-C',str(root),'-c','core.autocrlf=false','archive','--format=tar',commit],stdout=subprocess.PIPE) as process:
        with archive.open('xb') as raw_archive,gzip.GzipFile(filename='',fileobj=raw_archive,mode='wb',mtime=0) as compressed:shutil.copyfileobj(process.stdout,compressed)
        if process.wait()!=0:raise ValueError('Git archive failed')
    found={}
    with tarfile.open(archive,'r:gz') as contents:
        for member in contents:
            if member.isdir():continue
            if not member.isfile() or member.name in found or member.name not in expected:raise ValueError('Extra, duplicate or linked archive member')
            found[member.name]=hashlib.file_digest(contents.extractfile(member),'sha256').hexdigest()
    if found!=expected:raise ValueError('Archive differs from complete public manifest')
    with archive.open('rb') as stream:archive_sha=hashlib.file_digest(stream,'sha256').hexdigest()
    checksum=output/'SHA256SUMS.txt';checksum.write_bytes((archive_sha+'  '+archive.name+'\n').encode())
    return archive,checksum

def verify_assets(release,files,complete=True):
    actual={a['name']:a for a in release.get('assets',[])}
    if set(actual)-{p.name for p in files}:raise ValueError('Unexpected existing release attachment')
    missing=[]
    for p in files:
        a=actual.get(p.name)
        if a is None:missing.append(p);continue
        with p.open('rb') as stream:expected=hashlib.file_digest(stream,'sha256').hexdigest()
        if a.get('state')!='uploaded' or a.get('size')!=p.stat().st_size or a.get('digest')!='sha256:'+expected:raise ValueError('Existing attachment differs; preserve it')
    if complete and missing:raise ValueError('Release attachments incomplete')
    return missing

def tag_commit(repo,tag):
    rows=command('git','ls-remote','https://github.com/'+repo+'.git','refs/tags/'+tag,'refs/tags/'+tag+'^{}').decode().splitlines()
    refs=dict(row.split('\t')[::-1] for row in rows)
    return refs.get('refs/tags/'+tag+'^{}',refs.get('refs/tags/'+tag))

def publish(root,commit,tag,repo,output):
    if repo!='Shiaoming123/nsp-wiki':raise ValueError('Unexpected repository')
    info=json.loads(command('gh','api','repos/'+repo))
    if info.get('private') is not False:raise ValueError('Only the public repository is supported')
    if tag_commit(repo,tag)!=commit:raise ValueError('Tag moved or is missing')
    archive,checksum=build(root,commit,tag,output);files=[archive,checksum]
    endpoint='repos/'+repo+'/releases/tags/'+tag
    response=subprocess.run(['gh','api',endpoint],capture_output=True)
    if response.returncode:
        if b'404' not in response.stderr:raise RuntimeError(response.stderr.decode(errors='replace'))
        subprocess.run(['gh','release','create',tag,'--repo',repo,'--target',commit,'--draft','--title','Wiki '+tag[5:],'--notes','完整公开源码及静态资源；逐文件校验见 PUBLIC-EXPORT.json，整包校验见 SHA256SUMS.txt。'],check=True)
        release=json.loads(command('gh','api',endpoint))
    else:release=json.loads(response.stdout)
    missing=verify_assets(release,files,complete=False)
    if missing:
        if not release['draft']:raise ValueError('Incomplete public release requires review')
        subprocess.run(['gh','release','upload',tag,*map(str,missing),'--repo',repo],check=True)
    release=json.loads(command('gh','api',endpoint));verify_assets(release,files)
    if tag_commit(repo,tag)!=commit:raise ValueError('Tag moved during publication')
    if release['draft']:subprocess.run(['gh','release','edit',tag,'--repo',repo,'--draft=false'],check=True)
    release=json.loads(command('gh','api',endpoint));verify_assets(release,files)
    if release['draft'] or release.get('prerelease'):raise ValueError('Release is not public and final')
    print(json.dumps({'status':'PASS','publicCommit':commit,'tag':tag,'url':release['html_url'],'archiveBytes':archive.stat().st_size,'archiveSHA256':checksum.read_text().split()[0]}))

if __name__=='__main__':
    publish(Path.cwd(),os.environ['PUBLIC_COMMIT'],os.environ['RELEASE_TAG'],os.environ['PUBLIC_REPOSITORY'],Path(os.environ['RUNNER_TEMP'])/'wiki-release-'+os.environ['GITHUB_RUN_ATTEMPT'])

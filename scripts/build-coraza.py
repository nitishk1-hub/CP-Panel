"""Reproducible pinned Coraza connector build; no production service changes."""
import hashlib,json,os,pathlib,shutil,subprocess,sys,tarfile,urllib.request
base=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/cyberpross-coraza-build').resolve();base.mkdir(parents=True,exist_ok=True);arc=base/'go.tar.gz'
compiler='go1.27.4';checksum='7226736c2339719cda28fbf3a54d71aa63bcefe376e98cef00034268dab24840'
if not arc.exists():urllib.request.urlretrieve('https://go.dev/dl/'+compiler+'.linux-amd64.tar.gz',arc)
if hashlib.sha256(arc.read_bytes()).hexdigest()!=checksum:raise SystemExit('Official compiler checksum mismatch')
if not (base/'go/bin/go').exists():
 with tarfile.open(arc) as tar:tar.extractall(base,filter='data')
go=str(base/'go/bin/go');env=dict(os.environ,PATH=str(base/'go/bin')+':'+os.environ['PATH'],GOBIN=str(base/'bin'),GOPATH=str(base/'gopath'),GOTOOLCHAIN='local',GOMAXPROCS='4',GOFLAGS='-buildvcs=false',GOSUMDB='sum.golang.org',GOPROXY='https://proxy.golang.org',GOPRIVATE='',GONOSUMDB='')
subprocess.run([go,'install','github.com/caddyserver/xcaddy/cmd/xcaddy@v0.4.7'],env=env,check=True)
module='github.com/corazawaf/coraza-caddy/v2@v2.6.2';metadata=json.loads(subprocess.check_output([go,'mod','download','-json',module],env=env));connector=base/'private-connector'
if connector.exists():shutil.rmtree(connector)
shutil.copytree(metadata['Dir'],connector)
for file in connector.rglob('*'):
 if file.is_file():file.chmod(0o644)
subprocess.run([sys.executable,str(pathlib.Path(__file__).with_name('coraza-privacy-patch.py')),str(connector)],check=True)
binary=base/'coraza-caddy';subprocess.run([str(base/'bin/xcaddy'),'build','v2.11.9','--with',module+'='+str(connector),'--output',str(binary)],cwd=base,env=env,check=True)
provenance={'compiler':compiler,'compilerArchiveSHA256':checksum,'caddy':'v2.11.9','connector':module,'upstreamModuleSum':metadata['Sum'],'privacyPatchSHA256':hashlib.sha256(pathlib.Path(__file__).with_name('coraza-privacy-patch.py').read_bytes()).hexdigest(),'binarySHA256':hashlib.sha256(binary.read_bytes()).hexdigest()}
(base/'provenance.json').write_text(json.dumps(provenance,indent=2));print(json.dumps(provenance))

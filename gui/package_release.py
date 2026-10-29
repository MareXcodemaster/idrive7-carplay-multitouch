"""Package the Windows executable and source without firmware, keys or Git data."""
from pathlib import Path
import hashlib,json,shutil,sys,zipfile
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build import build
PACKAGE=Path(__file__).resolve().parent.parent
VERSION='0.2.1'
def local_tests(out):
 core_path=out/'gui-core-tests.json';backend_path=out/'gui-backend-tests.json'
 if not core_path.exists() or not backend_path.exists():return {'passed':False,'note':'Local test reports are not available in this build directory'}
 core=json.loads(core_path.read_text(encoding='utf-8'));backend=json.loads(backend_path.read_text(encoding='utf-8'))
 return {'backendGroups':sum(v.get('groups',0) for v in backend.values()),'windowsCoreGroups':core.get('groups',0),'passed':bool(core.get('passed')) and all(v.get('passed') for v in backend.values())}
def package():
 exe=build();out=exe.parent
 for src,dst in [('gui/README-PL.md','INSTRUKCJA-PL.md'),('gui/README-EN.md','README-EN.md'),('LICENSE','LICENSE')]:shutil.copyfile(PACKAGE/src,out/dst)
 names=[exe.name,exe.name+'.config','INSTRUKCJA-PL.md','README-EN.md','LICENSE']
 screenshots=PACKAGE/'gui/screenshots'
 if screenshots.exists():
  (out/'screenshots').mkdir(exist_ok=True)
  for image in sorted(screenshots.glob('*.png')):
   name='screenshots/'+image.name;shutil.copyfile(image,out/name);names.append(name)
  shutil.copyfile(screenshots/'windows-key-en.png',out/'SSH-KEY-GUIDE.png');names.append('SSH-KEY-GUIDE.png')
 (out/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256((out/n).read_bytes()).hexdigest()+'  '+n+'\n' for n in names),encoding='utf-8');names.append('SHA256SUMS.txt')
 binary=out/('iDrive7-Multitouch-Installer-v'+VERSION+'-Windows.zip')
 with zipfile.ZipFile(binary,'w',zipfile.ZIP_DEFLATED) as z:
  for n in names:z.write(out/n,n)
 source=out/('iDrive7-Multitouch-Installer-v'+VERSION+'-Source.zip');count=0
 with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED) as z:
  for f in sorted(PACKAGE.rglob('*')):
   rel=f.relative_to(PACKAGE)
   if not f.is_file() or '.git' in rel.parts or '__pycache__' in rel.parts or rel.as_posix()=='gui/payload.tar':continue
   if f.suffix.lower() not in ['.js','.json','.md','.py','.cs','.c','.png','.manifest','.conf','.yml','.yaml','.txt','.sh'] and f.name not in ['LICENSE','.gitignore','.gitattributes']:continue
   data=f.read_bytes()
   if len(data)>1024*1024:raise RuntimeError('Unexpected large source: '+str(rel))
   if b'-----BEGIN OPENSSH PRIVATE KEY-----' in data or b'-----BEGIN RSA PRIVATE KEY-----' in data:
    # The packaging source itself contains these guard literals, not a key.
    if rel.as_posix()!='gui/package_release.py':raise RuntimeError('Private key in source: '+str(rel))
   z.write(f,'idrive7-carplay-multitouch/'+rel.as_posix());count+=1
 for f in [binary,source]:
  with zipfile.ZipFile(f) as z:
   if z.testzip():raise RuntimeError('ZIP verification failed')
 report={'version':VERSION,'patchContacts':2,'defaultLanguage':'English','release':{'name':binary.name,'bytes':binary.stat().st_size,'sha256':hashlib.sha256(binary.read_bytes()).hexdigest()},'source':{'name':source.name,'files':count,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()},'guiLocalTests':local_tests(out),'guiVehicleInstallTested':False,'underlyingPatchPreviouslyVehicleTested':True,'backupScope':'CarPlay files and patch configuration, not full MGU','containsFirmware':False,'containsPrivateKeys':False}
 (out/'release-manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,indent=2))
if __name__=='__main__':package()

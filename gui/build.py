"""Build the Windows GUI using the .NET Framework compiler already in Windows."""
from pathlib import Path
import os,io,tarfile,subprocess,json,hashlib,sys
HERE=Path(__file__).resolve().parent;PACKAGE=HERE.parent
def build(output=None):
 out=Path(output).resolve() if output else PACKAGE.parents[1]/'CarPlay-Multitouch-Installer'
 out.mkdir(parents=True,exist_ok=True)
 assets=['agent.js','read-voltage.js','patch/patcher.js','patch/patch.json','patch/composable.js','runtime/manager.js','runtime/60-mgu-carplay-multitouch.conf','gui/backend.js']
 resource=HERE/'payload.tar'
 with tarfile.open(resource,'w',format=tarfile.USTAR_FORMAT) as tar:
  for name in assets:
   data=(PACKAGE/name).read_bytes().replace(b'\r\n',b'\n');item=tarfile.TarInfo(name);item.size=len(data);item.mode=0o600;item.mtime=0;tar.addfile(item,io.BytesIO(data))
 csc=Path(os.environ.get('SystemRoot',r'C:\Windows'))/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 exe=out/'iDrive7-Multitouch-Installer.exe'
 args=[str(csc),'/nologo','/target:winexe','/platform:anycpu','/optimize+','/utf8output','/out:'+str(exe),'/win32manifest:'+str(HERE/'app.manifest'),'/resource:'+str(resource)+',payload.tar','/r:System.dll','/r:System.Core.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll',str(HERE/'Core.cs'),str(HERE/'App.cs'),str(HERE/'KeyHelp.cs'),str(HERE/'AssemblyInfo.cs')]
 result=subprocess.run(args,capture_output=True,text=True,encoding='utf-8')
 if result.returncode:raise RuntimeError(result.stdout+result.stderr)
 (out/(exe.name+'.config')).write_text('<?xml version="1.0"?><configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8"/></startup></configuration>',encoding='utf-8')
 manifest={'file':exe.name,'sha256':hashlib.sha256(exe.read_bytes()).hexdigest(),'bytes':exe.stat().st_size,'assets':assets,'containsFirmware':False,'containsPrivateKeys':False}
 (out/'build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps(manifest,indent=2))
 return exe
if __name__=='__main__':build(sys.argv[1] if len(sys.argv)>1 else None)

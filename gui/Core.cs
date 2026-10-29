using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Linq;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Reflection;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace MguInstaller {
public static class Json {
 public static JavaScriptSerializer Serializer() { return new JavaScriptSerializer { MaxJsonLength=64*1024*1024, RecursionLimit=80 }; }
 public static Dictionary<string,object> Parse(string s) { return Serializer().Deserialize<Dictionary<string,object>>(s); }
 public static string Write(object o) { return Serializer().Serialize(o); }
 public static Dictionary<string,object> Obj(IDictionary<string,object> d,string k) { return d.ContainsKey(k)?d[k] as Dictionary<string,object>:null; }
 public static string Str(IDictionary<string,object> d,string k) { return d!=null&&d.ContainsKey(k)&&d[k]!=null?Convert.ToString(d[k]):""; }
 public static bool Bool(IDictionary<string,object> d,string k) { return d!=null&&d.ContainsKey(k)&&d[k] is bool&&(bool)d[k]; }
}
public class Vehicle { public string Host="169.254.50.55",Vin="",Gateway="",Source=""; }
public static class Network {
 public static bool LocalIPv4(string s) {
  IPAddress a;if(!IPAddress.TryParse(s,out a)||a.AddressFamily!=AddressFamily.InterNetwork)return false;
  byte[] b=a.GetAddressBytes();return b[0]==10||(b[0]==172&&b[1]>=16&&b[1]<=31)||(b[0]==192&&b[1]==168)||(b[0]==169&&b[1]==254);
 }
 public static string ParseVin(byte[] data) {
  string s=Encoding.ASCII.GetString(data).Replace("\0","");int p=s.IndexOf("BMWVIN",StringComparison.Ordinal);
  if(p<0||s.Length<p+23)return "";string vin=s.Substring(p+6,17);
  return vin.All(c=>char.IsDigit(c)||(c>='A'&&c<='Z'&&c!='I'&&c!='O'&&c!='Q'))?vin:"";
 }
 public static Vehicle Discover(string manualHost) {
  var found=new Dictionary<string,string>();var sources=new Dictionary<string,string>();
  foreach(var nic in NetworkInterface.GetAllNetworkInterfaces().Where(n=>n.OperationalStatus==OperationalStatus.Up&&n.NetworkInterfaceType==NetworkInterfaceType.Ethernet)) {
   foreach(var ip in nic.GetIPProperties().UnicastAddresses.Where(x=>x.Address.AddressFamily==AddressFamily.InterNetwork&&x.Address.ToString().StartsWith("169.254."))) {
    try { using(var u=new UdpClient(new IPEndPoint(ip.Address,0))) {
     u.EnableBroadcast=true;u.Client.ReceiveTimeout=150;byte[] probe={0,0,0,0,0,17};u.Send(probe,probe.Length,new IPEndPoint(IPAddress.Parse("169.254.255.255"),6811));
     var end=DateTime.UtcNow.AddMilliseconds(1200);
     while(DateTime.UtcNow<end) { try { IPEndPoint sender=new IPEndPoint(IPAddress.Any,0);string vin=ParseVin(u.Receive(ref sender));if(vin!=""&&sender.Address.ToString().StartsWith("169.254.")){found[sender.Address.ToString()]=vin;sources[sender.Address.ToString()]=ip.Address.ToString();} }catch(SocketException){} }
    }}catch(SocketException){}
   }
  }
  if(found.Values.Distinct().Count()>1)throw new Exception("Wykryto kilka samochodów. Podłącz tylko własne auto. / Multiple vehicles detected.");
  var v=new Vehicle();if(found.Count>0){v.Gateway=found.First().Key;v.Vin=found.First().Value;v.Source=sources[v.Gateway];try{v.Host=ReadMguIp(v.Gateway,v.Source);}catch(Exception){}}
  if(!string.IsNullOrWhiteSpace(manualHost)) { if(!LocalIPv4(manualHost.Trim()))throw new Exception("Podaj lokalny adres IPv4 MGU. / Use a local MGU IPv4 address.");if(manualHost.Trim()!=v.Host){v.Vin="";v.Gateway="";v.Source="";}v.Host=manualHost.Trim(); }
  if(found.Count==0&&string.IsNullOrWhiteSpace(manualHost))throw new Exception("Brak odpowiedzi ENET. Podłącz kabel i włącz MGU lub wpisz jego IP w ustawieniach. / No ENET reply; connect the cable and wake MGU, or enter its IP.");
  return v;
 }
 static byte[] ReadExact(Stream s,int n) { byte[] b=new byte[n];int p=0;while(p<n){int k=s.Read(b,p,n-p);if(k==0)throw new EndOfStreamException();p+=k;}return b; }
 public static string ParseIp(byte[] p) {
  for(int i=0;i+16<=p.Length;i++)if(p[i]==0x62&&p[i+1]==0x17&&p[i+2]==0x2a&&p[i+3]==0){string ip=new IPAddress(p.Skip(i+4).Take(4).ToArray()).ToString();if(LocalIPv4(ip))return ip;}
  throw new Exception("Invalid MGU IP response");
 }
 static string ReadMguIp(string gateway,string source) {
  using(var tcp=new TcpClient(new IPEndPoint(IPAddress.Parse(source),0))) {
   var connect=tcp.ConnectAsync(gateway,6801);if(!connect.Wait(2000))throw new TimeoutException();tcp.ReceiveTimeout=2000;tcp.SendTimeout=2000;
   using(var stream=tcp.GetStream()) {
    // Only ReadDataByIdentifier 22 17 2A is sent. No coding/programming requests.
    byte[] request={0,0,0,5,0,1,0xf4,0x63,0x22,0x17,0x2a};stream.Write(request,0,request.Length);
    var deadline=DateTime.UtcNow.AddSeconds(3);
    while(DateTime.UtcNow<deadline){byte[] h=ReadExact(stream,6);int len=(h[0]<<24)|(h[1]<<16)|(h[2]<<8)|h[3];if(len<2||len>1024*1024)throw new Exception("Invalid ENET frame");byte[] b=ReadExact(stream,len);if(h[4]==0&&h[5]==1&&b[0]==0x63&&b[1]==0xf4)return ParseIp(b.Skip(2).ToArray());}
   }
  }throw new TimeoutException();
 }
}
public class CommandResult { public byte[] Data;public string Error;public int Exit; }
public sealed class PreparedKey:IDisposable {
 public string FilePath {get;private set;}
 PreparedKey(string file){FilePath=file;}
 public static PreparedKey Create(string original) {
  if(string.IsNullOrWhiteSpace(original))return new PreparedKey(null);
  string folder=System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"iDrive7Multitouch","KeySessions");Directory.CreateDirectory(folder);
  string file=System.IO.Path.Combine(folder,Guid.NewGuid().ToString("N")+".key");
  try{
   var sid=WindowsIdentity.GetCurrent().User;var security=new FileSecurity();security.SetAccessRuleProtection(true,false);security.SetOwner(sid);security.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,AccessControlType.Allow));
   // The restricted DACL is applied at creation, before copying any key bytes.
   using(var destination=new FileStream(file,FileMode.CreateNew,FileSystemRights.Write,FileShare.None,4096,FileOptions.None,security))using(var source=File.OpenRead(original)){source.CopyTo(destination);destination.Flush(true);}
   return new PreparedKey(file);
  }catch(Exception e){try{if(File.Exists(file))File.Delete(file);}catch{}throw new Exception("Cannot prepare the SSH key for authentication: "+e.Message);}
 }
 public void Dispose(){if(FilePath!=null){try{File.Delete(FilePath);}finally{FilePath=null;}}}
}
public static class KeyResolver {
 public static void ValidatePrivateKeyFile(string file) {
  string name=Path.GetFileName(file);
  if(name.EndsWith(".pub",StringComparison.OrdinalIgnoreCase)||name.EndsWith(".pub.pem",StringComparison.OrdinalIgnoreCase))throw new Exception("To klucz publiczny. Wybierz id_rsa bez rozszerzenia. / This is a public key. Select id_rsa without an extension.");
  if(name.EndsWith(".ppk",StringComparison.OrdinalIgnoreCase))throw new Exception("To format PuTTY. Ten instalator używa OpenSSH — wybierz id_rsa z tego samego folderu. / This is a PuTTY key. Choose the OpenSSH id_rsa from the same folder.");
  if(name.Equals("01_PRIVATE_KEY.pem",StringComparison.OrdinalIgnoreCase))throw new Exception("To klucz enrollmentu, nie logowania SSH. Wybierz data/enrollments/<VIN>/id_rsa. / This is the enrollment key, not the SSH login key. Select data/enrollments/<VIN>/id_rsa.");
  byte[] prefix=new byte[192];int count;using(var s=File.OpenRead(file))count=s.Read(prefix,0,prefix.Length);
  string text=Encoding.ASCII.GetString(prefix,0,count).TrimStart('\ufeff',' ','\r','\n','\t');
  string start="-----BEGIN ";string end=" PRIVATE KEY-----";
  if(!(text.StartsWith(start+"OPENSSH"+end,StringComparison.Ordinal)||text.StartsWith(start+"RSA"+end,StringComparison.Ordinal)||text.StartsWith(start+"EC"+end,StringComparison.Ordinal)||text.StartsWith(start+"PRIVATE KEY-----",StringComparison.Ordinal)||text.StartsWith(start+"ENCRYPTED"+end,StringComparison.Ordinal)))throw new Exception("Nie rozpoznano prywatnego klucza SSH. Wybierz plik id_rsa wyeksportowany przez narzędzie do rootowania. / Not a recognized private SSH key. Choose the id_rsa exported by the rooting tool.");
 }
 public static List<string> Find(string vin,IEnumerable<string> roots) {
  var result=new List<string>();
  if(vin==null||vin.Length!=17||vin.Any(c=>!(c>='A'&&c<='Z')&&!char.IsDigit(c)))return result;
  string suffix=Path.Combine("data","enrollments",vin,"id_rsa");
  var visited=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var queue=new Queue<KeyValuePair<string,int>>();
  foreach(string r in roots){if(!string.IsNullOrWhiteSpace(r))queue.Enqueue(new KeyValuePair<string,int>(r,0));}
  int scanned=0;
  while(queue.Count>0&&scanned<350&&result.Count<4){
   var item=queue.Dequeue();string dir;try{dir=Path.GetFullPath(item.Key);}catch{continue;}if(!visited.Add(dir)||!Directory.Exists(dir))continue;scanned++;
   foreach(string relative in new[]{suffix,Path.Combine("MGU-SSH",suffix),Path.Combine("dist","MGU-SSH",suffix),Path.Combine("idrive7-8-ssh-root",suffix),Path.Combine("repos","idrive7-8-ssh-root",suffix),Path.Combine("BMW-MGU","repos","idrive7-8-ssh-root",suffix)}){
    string candidate=Path.Combine(dir,relative);try{if(File.Exists(candidate)&&!result.Contains(candidate,StringComparer.OrdinalIgnoreCase))result.Add(candidate);}catch{}
   }
   if(item.Value>=2)continue;
   try{foreach(string child in Directory.EnumerateDirectories(dir).Take(80)){try{if((File.GetAttributes(child)&FileAttributes.ReparsePoint)==0)queue.Enqueue(new KeyValuePair<string,int>(child,item.Value+1));}catch{}}}catch{}
  }
  return result;
 }
 public static List<string> FindForVehicle(string vin) {
  string user=Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);var roots=new List<string>();
  string current=AppDomain.CurrentDomain.BaseDirectory;
  for(int i=0;i<7&&!string.IsNullOrEmpty(current);i++){
   if(!current.StartsWith(user+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)&&!current.TrimEnd('\\').Equals(user,StringComparison.OrdinalIgnoreCase))break;
   // Check ancestors directly, without recursively walking the entire profile.
   if(!current.TrimEnd('\\').Equals(user,StringComparison.OrdinalIgnoreCase))roots.Add(current);
   current=Path.GetDirectoryName(current.TrimEnd(Path.DirectorySeparatorChar));
  }
  roots.Add(Path.Combine(user,"Downloads"));roots.Add(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory));roots.Add(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments));
  return Find(vin,roots);
 }
}
public static class Commands {
 public static string Q(string s) {
  var b=new StringBuilder("\"");int slash=0;
  foreach(char c in s){if(c=='\\'){slash++;continue;}if(c=='\"'){b.Append('\\',slash*2+1).Append(c);slash=0;continue;}b.Append('\\',slash).Append(c);slash=0;}
  return b.Append('\\',slash*2).Append('"').ToString();
 }
 public static CommandResult Run(string exe,IEnumerable<string> args,byte[] input,int timeout,int maxBytes) {
  var info=new ProcessStartInfo(exe,string.Join(" ",args.Select(Q))) { UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true };
  using(var p=new Process{StartInfo=info}) {
   p.Start();var err=p.StandardError.ReadToEndAsync();
   var output=Task.Run(()=>{using(var m=new MemoryStream()){byte[] b=new byte[32768];int n;while((n=p.StandardOutput.BaseStream.Read(b,0,b.Length))>0){if(m.Length+n>maxBytes)throw new Exception("Output size limit");m.Write(b,0,n);}return m.ToArray();}});
   var writer=Task.Run(()=>{try{if(input!=null)p.StandardInput.BaseStream.Write(input,0,input.Length);}finally{p.StandardInput.Close();}});
   if(!p.WaitForExit(timeout)){try{p.Kill();}catch{}throw new TimeoutException("Przekroczony czas połączenia. / Connection timed out.");}
   Task.WaitAll(new Task[]{output,err,writer},5000);
   return new CommandResult{Data=output.Result,Error=err.Result,Exit=p.ExitCode};
  }
 }
 public static string Sha(byte[] b){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(b)).Replace("-","").ToLowerInvariant();}
}
public class Session {
 public const string RootHelp="https://github.com/cauliflowermossgrape/idrive7-8-ssh-root#readme";
 public const string RootKeyHelp="https://github.com/cauliflowermossgrape/idrive7-8-ssh-root#the-ssh-key-and-connect-info";
 public const string OriginalSha="ddb33e33161387c6479c391684b3d019b0de54ecfcee8d6877eca94aa62f3e50";
 public const string CandidateSha="2a009e6afe22f8f385b164ec9e2a7c2aa22b1c1c3ac2110d04f80715dc2c01de";
 public Vehicle Vehicle;public string Key,BackupFolder,KnownHosts,LastBackup="";public Dictionary<string,object> Probe;
 public Action<string> Log;public Func<string,bool> Trust;
 string folder="/tmp/mgu-gui-"+Guid.NewGuid().ToString("N"),ssh,scan,keygen,home;
 public Session(Vehicle vehicle,string key,string backup,Action<string> log,Func<string,bool> trust) {
  Vehicle=vehicle;Key=key;BackupFolder=backup;Log=log;Trust=trust;
  home=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"iDrive7Multitouch");Directory.CreateDirectory(home);KnownHosts=Path.Combine(home,"known_hosts");
  string tools=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),"System32","OpenSSH");
  ssh=Path.Combine(tools,"ssh.exe");scan=Path.Combine(tools,"ssh-keyscan.exe");keygen=Path.Combine(tools,"ssh-keygen.exe");
  if(!File.Exists(ssh)||!File.Exists(scan)||!File.Exists(keygen))throw new Exception("Brak klienta Windows OpenSSH. Włącz go w Funkcjach opcjonalnych Windows. / Install the Windows OpenSSH Client optional feature.");
  if(!string.IsNullOrWhiteSpace(key)){if(!File.Exists(key))throw new Exception("Nie znaleziono wybranego klucza SSH. / SSH key file not found.");KeyResolver.ValidatePrivateKeyFile(key);}
 }
 public void VerifyHost() {
  var r=Commands.Run(scan,new[]{"-T","4","-t","ed25519",Vehicle.Host},null,8000,32768);
  string line=Encoding.UTF8.GetString(r.Data).Split('\n').Select(x=>x.Trim()).FirstOrDefault(x=>x.StartsWith(Vehicle.Host+" ssh-ed25519 "));
  if(line==null)throw new Exception("Port SSH nie odpowiada. Sprawdź ENET, zasilanie MGU i odblokowanie root/SSH. / SSH is unavailable; check ENET, MGU power and root/SSH setup.");
  var old=File.Exists(KnownHosts)?File.ReadAllLines(KnownHosts).ToList():new List<string>();
  if(old.Any(x=>x.Trim()==line))return;
  string temp=Path.Combine(home,"host-key-check.pub");File.WriteAllText(temp,line+"\n",new UTF8Encoding(false));
  var fp=Commands.Run(keygen,new[]{"-lf",temp},null,5000,32768);string print=Encoding.UTF8.GetString(fp.Data).Trim();
  string message=(old.Any(x=>x.StartsWith(Vehicle.Host+" "))?"Klucz SSH zmienił się, np. po restarcie MGU. / SSH key changed, possibly after MGU reboot.\n\n":"Pierwsze połączenie SSH. / First SSH connection.\n\n")+"VIN: "+(Vehicle.Vin==""?"nieodczytany / unavailable":Vehicle.Vin)+"\nIP: "+Vehicle.Host+"\n"+print+"\n\nZaufaj temu MGU? / Trust this MGU?";
  if(!Trust(message))throw new Exception("Nie zaakceptowano klucza SSH. / SSH host key was not accepted.");
  old.RemoveAll(x=>x.StartsWith(Vehicle.Host+" "));old.Add(line);File.WriteAllLines(KnownHosts,old,new UTF8Encoding(false));
 }
 byte[] Ssh(string command,byte[] input,int timeout) {
  using(var prepared=PreparedKey.Create(Key)){
  var a=new List<string>{"-F","NUL","-T","-p","22","-o","BatchMode=yes","-o","ConnectTimeout=6","-o","ServerAliveInterval=10","-o","ServerAliveCountMax=2","-o","StrictHostKeyChecking=yes","-o","UserKnownHostsFile=\""+KnownHosts.Replace('\\','/')+"\"","-o","LogLevel=ERROR"};
  if(!string.IsNullOrWhiteSpace(Vehicle.Source)){a.AddRange(new[]{"-b",Vehicle.Source});}
  if(!string.IsNullOrWhiteSpace(prepared.FilePath)){a.AddRange(new[]{"-i",prepared.FilePath,"-o","IdentitiesOnly=yes"});}a.Add("root@"+Vehicle.Host);a.Add(command);
  var r=Commands.Run(ssh,a,input,timeout,64*1024*1024);
  if(r.Exit!=0)throw new Exception(string.IsNullOrWhiteSpace(r.Error)?Encoding.UTF8.GetString(r.Data):r.Error.Trim());return r.Data;
  }
 }
 byte[] Payload() { using(var s=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.tar"))using(var m=new MemoryStream()){s.CopyTo(m);return m.ToArray();} }
 public void Connect() {
  VerifyHost();string uid="";
  if(!string.IsNullOrWhiteSpace(Key))uid=Encoding.UTF8.GetString(Ssh("id -u",null,15000)).Trim();
  else {
   Exception failure=null;var candidates=KeyResolver.FindForVehicle(Vehicle.Vin);
   Log("Automatyczne sprawdzanie root/SSH… / Automatically checking root/SSH…");
   // VIN-specific enrollment first avoids unrelated agent identities exhausting
   // the server's authentication limit. No key contents are logged or uploaded.
   foreach(string candidate in candidates){
    try{KeyResolver.ValidatePrivateKeyFile(candidate);}catch(Exception){Log("Pominięto plik bez formatu klucza prywatnego / Skipped a file that is not a private key");continue;}
    Key=candidate;try{uid=Encoding.UTF8.GetString(Ssh("id -u",null,15000)).Trim();Log("Znaleziono klucz dla VIN / Found enrollment key for VIN: "+Vehicle.Vin);break;}
    catch(Exception e){if(!AuthenticationFailure(e.Message))throw;failure=e;}
   }
   if(uid==""){
    Key="";try{uid=Encoding.UTF8.GetString(Ssh("id -u",null,15000)).Trim();Log("Użyto agenta SSH lub standardowego logowania / Used SSH agent or default authentication");}
    catch(Exception e){if(!AuthenticationFailure(e.Message))throw;failure=e;}
   }
   if(uid=="")throw new Exception("Nie udało się automatycznie uwierzytelnić SSH. Wybierz klucz root z odblokowania jednostki lub sprawdź instrukcję. / Automatic SSH authentication failed. Select your enrollment root key or see the setup instructions.\n"+(failure==null?"":failure.Message));
  }
  if(uid!="0")throw new Exception("ROOT_REQUIRED: zalogowany użytkownik nie ma UID 0. / Authenticated user is not root.");
  EnsureStage();Probe=Action("probe");
 }
 static bool AuthenticationFailure(string message) {
  return message.IndexOf("Permission denied",StringComparison.OrdinalIgnoreCase)>=0||message.IndexOf("authentication",StringComparison.OrdinalIgnoreCase)>=0||message.IndexOf("Load key",StringComparison.OrdinalIgnoreCase)>=0||message.IndexOf("invalid format",StringComparison.OrdinalIgnoreCase)>=0;
 }
 void EnsureStage() {
  string exists=Encoding.UTF8.GetString(Ssh("if [ -f "+folder+"/gui/backend.js ]; then echo yes; else echo no; fi",null,12000)).Trim();
  if(exists=="yes")return;
  Ssh("umask 077; mkdir -m 0700 "+folder,null,12000);
  Ssh("tar -xf - -C "+folder,Payload(),25000);
 }
 public Dictionary<string,object> Action(string action) {
  if(!new[]{"probe","backup","status","install","uninstall","restore","reboot"}.Contains(action))throw new ArgumentException("Unknown action");
  EnsureStage();return Json.Parse(Encoding.UTF8.GetString(Ssh("/usr/bin/node "+folder+"/gui/backend.js "+action,null,60000)).Trim());
 }
 public static Dictionary<string,object> ValidateBackup(Dictionary<string,object> b) {
  if(Json.Str(b,"format")!="mgu-carplay-backup"||Convert.ToInt32(b["version"])!=1||Json.Str(b,"originalSha256")!=OriginalSha)throw new Exception("Nieznany format lub niezgodny firmware kopii. / Invalid backup format or firmware.");
  var files=Json.Obj(b,"files");if(files==null||!files.ContainsKey("usr/bin/carplay")||!files.ContainsKey("lib/systemd/system/carplay.service"))throw new Exception("Niepełna kopia / Incomplete backup");
  var allowed=new HashSet<string>{"usr/bin/carplay","lib/systemd/system/carplay.service","etc/systemd/system/carplay.service.d/60-mgu-carplay-multitouch.conf"};
  foreach(string n in new[]{"carplay","manager.js","install.json","factory-unit.txt","disabled.json","pending.json","health.json"})allowed.Add("var/opt/mgu-carplay-multitouch/"+n);
  long size=0;foreach(var pair in files){if(!allowed.Contains(pair.Key))throw new Exception("Unexpected backup path");var f=(Dictionary<string,object>)pair.Value;string text=Json.Str(f,"data");if(text.Length>16*1024*1024)throw new Exception("Backup file too large");byte[] data=Convert.FromBase64String(text);size+=data.Length;if(size>32*1024*1024||data.Length!=Convert.ToInt64(f["size"])||Commands.Sha(data)!=Json.Str(f,"sha256"))throw new Exception("Uszkodzona kopia: "+pair.Key+" / Backup checksum mismatch");}
  var original=(Dictionary<string,object>)files["usr/bin/carplay"];if(Json.Str(original,"sha256")!=OriginalSha)throw new Exception("Invalid original in backup");
  if(Json.Obj(b,"state")==null||!Json.Obj(b,"state").ContainsKey("wasInstalled"))throw new Exception("Missing backup state");return b;
 }
 public static Dictionary<string,object> ReadBackup(string file) {
  if(new FileInfo(file).Length>64*1024*1024)throw new Exception("Backup file too large");
  using(var f=File.OpenRead(file))using(var zip=new GZipStream(f,CompressionMode.Decompress))using(var m=new MemoryStream()) {
   byte[] buf=new byte[32768];int n;while((n=zip.Read(buf,0,buf.Length))>0){if(m.Length+n>48*1024*1024)throw new Exception("Backup expansion limit");m.Write(buf,0,n);}return ValidateBackup(Json.Parse(Encoding.UTF8.GetString(m.ToArray())));
  }
 }
 public string Backup() {
  Log("Kopia: pobieranie plików CarPlay i konfiguracji… / Downloading rollback backup…");
  var b=Action("backup");ValidateBackup(b);b["vehicleVin"]=Vehicle.Vin;b["mguIp"]=Vehicle.Host;
  string dir=Path.Combine(BackupFolder,Vehicle.Vin==""?"MGU":Vehicle.Vin);Directory.CreateDirectory(dir);
  string name=Path.Combine(dir,DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff")+"-CarPlay.mgubak"),part=name+".partial";
  byte[] data=Encoding.UTF8.GetBytes(Json.Write(b));using(var f=new FileStream(part,FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var zip=new GZipStream(f,CompressionMode.Compress)){zip.Write(data,0,data.Length);}
  ReadBackup(part);File.Move(part,name);File.WriteAllText(name+".sha256",Commands.Sha(File.ReadAllBytes(name))+"  "+Path.GetFileName(name)+"\n",new UTF8Encoding(false));
  File.WriteAllText(name+".txt","Kopia plików CarPlay i konfiguracji poprawki. To nie jest pełny obraz MGU.\r\nCarPlay rollback files and patch configuration; not a full MGU image.\r\nVIN: "+Vehicle.Vin+"\r\nUtworzono / Created: "+Json.Str(b,"createdAt")+"\r\nPliki / Files:\r\n"+string.Join("\r\n",Json.Obj(b,"files").Keys),Encoding.UTF8);
  LastBackup=name;Log("Kopia zapisana i sprawdzona / Backup saved and verified: "+name);return name;
 }
 public void Restore(string file) {
  var b=ReadBackup(file);string vin=Json.Str(b,"vehicleVin");
  if(vin==""||Vehicle.Vin==""||vin!=Vehicle.Vin)throw new Exception("VIN kopii musi zgadzać się z autem wykrytym przez ENET. / Backup VIN must match the vehicle discovered through ENET.");
  Backup();byte[] data=Encoding.UTF8.GetBytes(Json.Write(b));Ssh("umask 077; cat > "+folder+"/gui/restore.json",data,30000);Action("restore");
 }
 public void RequirePower() {
  Probe=Action("probe");var voltage=Json.Obj(Probe,"voltage");var value=voltage==null?null:Json.Obj(voltage,"value");
  if(value==null||Json.Str(value,"AppErrorType")!="DF_OK"||(Convert.ToInt32(value["STAT_MILLI_VOLT_WERT"])<13000||Convert.ToInt32(value["STAT_MILLI_VOLT_WERT"])>18000))throw new Exception("Wymagane stabilne zasilanie co najmniej 13,0 V. / Stable supply of at least 13.0 V is required.");
 }
 public Dictionary<string,object> Activate(bool wantPatched) {
  Action("reboot");Log("Restart MGU. Po uruchomieniu trwa kontrola przez 60 sekund. / MGU reboot; health verification takes 60 seconds after CarPlay starts.");
  DateTime deadline=DateTime.UtcNow.AddSeconds(190);System.Threading.Thread.Sleep(20000);string last="";
  while(DateTime.UtcNow<deadline) {
   try {
    VerifyHost();EnsureStage();var s=Action("status");
    if(wantPatched&&Json.Bool(s,"activePatched")&&Json.Obj(s,"pending")==null&&Json.Obj(s,"disabled")==null&&Json.Bool(Json.Obj(s,"health"),"verified"))return s;
    if(!wantPatched&&!Json.Bool(s,"installed")&&Json.Str(s,"processSha256")==OriginalSha)return s;
    if(Json.Obj(s,"disabled")!=null)throw new InvalidOperationException("Zabezpieczenie wybrało fabryczny CarPlay. Sprawdź dziennik. / Guard selected factory CarPlay; inspect the log.");
   }catch(InvalidOperationException){throw;}catch(Exception e){last=e.Message;}
   System.Threading.Thread.Sleep(5000);
  }
  throw new Exception("Nie potwierdzono uruchomienia. Ponów Połącz i sprawdź; kopia jest zachowana. / Startup not confirmed; reconnect and check. Backup retained.\n"+last);
 }
}
}

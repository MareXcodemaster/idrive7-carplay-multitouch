using System;using System.IO;using System.IO.Compression;using System.Text;using System.Linq;using System.Collections.Generic;using System.Security.AccessControl;using System.Security.Principal;
namespace MguInstaller {
class CoreTests {
 static int count;static void Check(bool yes,string name){if(!yes)throw new Exception(name);count++;}
 static void Reject(Action f,string name){bool rejected=false;try{f();}catch{rejected=true;}Check(rejected,name);}
 static int Main(string[] args){
  try{
   Check(Network.LocalIPv4("169.254.50.55")&&Network.LocalIPv4("192.168.1.10")&&Network.LocalIPv4("172.16.1.2"),"local IPv4 allowed");
   Check(!Network.LocalIPv4("8.8.8.8")&&!Network.LocalIPv4("127.0.0.1")&&!Network.LocalIPv4("224.0.0.1")&&!Network.LocalIPv4("169.254.1.2;whoami"),"nonlocal/injected hosts refused");
   Check(Network.ParseVin(Encoding.ASCII.GetBytes("\0BMWVINWBA12345678901234\0"))=="WBA12345678901234","VIN discovery");
   Check(Network.ParseVin(Encoding.ASCII.GetBytes("BMWVINshort"))=="","truncated VIN refused");
   byte[] reply={0x62,0x17,0x2a,0,169,254,50,55,255,255,0,0,0,0,0,0};Check(Network.ParseIp(reply)=="169.254.50.55","read-only IP response");
   Reject(()=>Network.ParseIp(new byte[]{0x62,0x17,0x2a,0,169}),"truncated IP response");
   string[] raw={"with space",@"C:\Path with spaces\","quote\"here","$(data)&literal`",""};var result=Commands.Run(args[0],raw,null,5000,32768);string[] actual=Json.Serializer().Deserialize<string[]>(Encoding.UTF8.GetString(result.Data));Check(result.Exit==0&&raw.SequenceEqual(actual),"real Windows argv quoting");
   string fixture=args[1];var valid=Session.ReadBackup(fixture);Check(Json.Str(valid,"format")=="mgu-carplay-backup","real firmware backup gzip roundtrip");
   string search=Path.Combine(Path.GetDirectoryName(fixture),"key-search-with-spaces"),vin="WBA12345678901234",other="WBA12345678909999";
   string right=Path.Combine(search,"idrive7-8-ssh-root","data","enrollments",vin,"id_rsa"),wrong=Path.Combine(search,"idrive7-8-ssh-root","data","enrollments",other,"id_rsa");
   Directory.CreateDirectory(Path.GetDirectoryName(right));Directory.CreateDirectory(Path.GetDirectoryName(wrong));File.WriteAllText(right,"FAKE TEST DATA, NOT A KEY");File.WriteAllText(wrong,"FAKE TEST DATA, NOT A KEY");
   Check(KeyResolver.Find(vin,new[]{search}).SequenceEqual(new[]{right}),"automatic key matches current VIN only");
   Check(KeyResolver.Find("",new[]{search}).Count==0&&KeyResolver.Find("../../other",new[]{search}).Count==0,"no enrollment guessing without valid VIN");
   using(var locked=new FileStream(right,FileMode.Open,FileAccess.Read,FileShare.None))Check(KeyResolver.Find(vin,new[]{search}).Contains(right),"key discovery does not read private key contents");
   string compiled=Path.Combine(Path.GetDirectoryName(fixture),"compiled-root-tool"),export=Path.Combine(compiled,"dist","MGU-SSH","data","enrollments",vin,"id_rsa");Directory.CreateDirectory(Path.GetDirectoryName(export));File.WriteAllText(export,"FAKE TEST DATA, NOT A KEY");Check(KeyResolver.Find(vin,new[]{compiled}).SequenceEqual(new[]{export}),"prebuilt root tool dist MGU-SSH layout");
   string format=Path.Combine(search,"format-tests");Directory.CreateDirectory(format);string sample=Path.Combine(format,"id_rsa");File.WriteAllText(sample,"-----BEGIN "+"OPENSSH PRIVATE KEY-----\nFAKE FORMAT FIXTURE ONLY");KeyResolver.ValidatePrivateKeyFile(sample);Check(true,"private key header recognized without claiming cryptographic validity");
   foreach(string invalid in new[]{"id_rsa.pub","id_rsa.pub.pem","id_rsa.ppk","01_PRIVATE_KEY.pem"}){string file=Path.Combine(format,invalid);File.Copy(sample,file,true);Reject(()=>KeyResolver.ValidatePrivateKeyFile(file),"wrong key kind refused: "+invalid);}
   string plain=Path.Combine(format,"plain.txt");File.WriteAllText(plain,"not a key");Reject(()=>KeyResolver.ValidatePrivateKeyFile(plain),"plain file refused");
   string sourceAcl=File.GetAccessControl(sample).GetSecurityDescriptorSddlForm(AccessControlSections.All),temporary;
   using(var protectedCopy=PreparedKey.Create(sample)){
    temporary=protectedCopy.FilePath;Check(File.ReadAllBytes(temporary).SequenceEqual(File.ReadAllBytes(sample)),"prepared key bytes preserved");
    var acl=File.GetAccessControl(temporary);var current=WindowsIdentity.GetCurrent().User;var rules=acl.GetAccessRules(true,true,typeof(SecurityIdentifier)).Cast<FileSystemAccessRule>().ToArray();Check(acl.AreAccessRulesProtected&&acl.GetOwner(typeof(SecurityIdentifier)).Equals(current)&&rules.Length==1&&rules[0].IdentityReference.Equals(current)&&rules[0].AccessControlType==AccessControlType.Allow,"temporary key is current-user-only at creation");
   }
   Check(!File.Exists(temporary),"temporary key removed after authentication scope");Check(File.GetAccessControl(sample).GetSecurityDescriptorSddlForm(AccessControlSections.All)==sourceAcl,"original key permissions unchanged");
   var corrupt=Json.Parse(Json.Write(valid));var files=Json.Obj(corrupt,"files");var original=(Dictionary<string,object>)files["usr/bin/carplay"];original["data"]=Convert.ToBase64String(Encoding.ASCII.GetBytes("damaged"));Reject(()=>Session.ValidateBackup(corrupt),"corrupt backup refused");
   var traversal=Json.Parse(Json.Write(valid));Json.Obj(traversal,"files")["../../etc/passwd"]=Json.Obj(valid,"files")["usr/bin/carplay"];Reject(()=>Session.ValidateBackup(traversal),"backup traversal refused");
   string bomb=Path.Combine(Path.GetDirectoryName(fixture),"oversize-test.mgubak");using(var f=File.Create(bomb))using(var gz=new GZipStream(f,CompressionMode.Compress)){byte[] zero=new byte[1024*1024];for(int i=0;i<49;i++)gz.Write(zero,0,zero.Length);}Reject(()=>Session.ReadBackup(bomb),"decompression size cap");File.Delete(bomb);
   File.WriteAllText(args[2],Json.Write(new{passed=true,groups=count,scope="Windows argv, ENET parsers, real backup checksums, traversal/corruption/decompression guards; no vehicle connections"}));Console.WriteLine("PASS "+count+" GUI core groups");return 0;
  }catch(Exception e){Console.Error.WriteLine(e);return 1;}
 }
}
}

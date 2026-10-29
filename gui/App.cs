using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Windows.Forms;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace MguInstaller {
public class MainForm:Form {
 readonly Color ink=Color.FromArgb(24,39,62),blue=Color.FromArgb(19,110,194),muted=Color.FromArgb(92,108,130);
 TextBox host=new TextBox(),key=new TextBox(),backup=new TextBox();RichTextBox log=new RichTextBox();
 Label hostCaption,keyCaption,backupCaption;
 Label connection=new Label(),state=new Label(),voltage=new Label(),step=new Label(),copyNote=new Label(),subtitle=new Label();
 Button connect=new Button(),install=new Button(),remove=new Button(),restore=new Button(),save=new Button(),open=new Button(),pickKey=new Button(),pickFolder=new Button();
 CheckBox ready=new CheckBox(),activate=new CheckBox();Button language=new Button();ProgressBar progress=new ProgressBar();LinkLabel rootLink=new LinkLabel(),keyHelp=new LinkLabel();
 Session session;bool busy=false,en=true,previewMode=false;string lastBackup="",logFile; string inputHost,inputKey,inputBackup;bool inputReady,inputActivate;
 string T(string pl,string eng){return en?eng:pl;}
 Label L(string text,int size=10,bool bold=false){return new Label{Text=text,AutoSize=true,ForeColor=ink,Font=new Font("Segoe UI",size,bold?FontStyle.Bold:FontStyle.Regular),Margin=new Padding(0,4,0,4)};}
 Button B(Button b,string text,bool primary=false){b.Text=text;b.Height=39;b.Width=145;b.FlatStyle=FlatStyle.Flat;b.FlatAppearance.BorderColor=primary?blue:Color.FromArgb(209,219,230);b.BackColor=primary?blue:Color.White;b.ForeColor=primary?Color.White:ink;b.Font=new Font("Segoe UI",10,FontStyle.Bold);b.Cursor=Cursors.Hand;b.Margin=new Padding(0,0,8,8);return b;}
 public MainForm() {
  Text="iDrive 7 · CarPlay Multitouch";Width=970;Height=850;MinimumSize=new Size(930,810);StartPosition=FormStartPosition.CenterScreen;
  BackColor=Color.FromArgb(243,246,251);ForeColor=ink;Font=new Font("Segoe UI",10);AutoScaleMode=AutoScaleMode.Dpi;
  var shell=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=7,Padding=new Padding(26,19,26,15)};
  foreach(var height in new[]{92,172,84,92,57})shell.RowStyles.Add(new RowStyle(SizeType.Absolute,height));shell.RowStyles.Add(new RowStyle(SizeType.Percent,100));shell.RowStyles.Add(new RowStyle(SizeType.Absolute,42));Controls.Add(shell);
  var header=new Panel{Dock=DockStyle.Fill};var title=L("CarPlay Multitouch · iDrive 7",25,true);title.Location=new Point(0,0);header.Controls.Add(title);subtitle.Location=new Point(1,47);subtitle.AutoSize=true;subtitle.ForeColor=muted;header.Controls.Add(subtitle);
  B(language,"Polski / EN");language.Height=29;language.Width=110;language.Dock=DockStyle.Top;var langPanel=new Panel{Dock=DockStyle.Right,Width=110,Padding=new Padding(0,7,0,0)};langPanel.Controls.Add(language);header.Controls.Add(langPanel);shell.Controls.Add(header);
  var grid=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,RowCount=4,BackColor=Color.White,Padding=new Padding(14,9,14,9)};
  grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,174));
  for(int i=0;i<4;i++)grid.RowStyles.Add(new RowStyle(SizeType.Absolute,36));
  grid.Controls.Add(hostCaption=L("MGU IP (auto)"),0,0);host.Dock=DockStyle.Fill;host.Margin=new Padding(0,3,12,3);grid.Controls.Add(host,1,0);B(connect,"Połącz i sprawdź",true);connect.Dock=DockStyle.Fill;grid.Controls.Add(connect,2,0);
  grid.Controls.Add(keyCaption=L("SSH key (optional)"),0,1);key.Dock=DockStyle.Fill;key.Margin=new Padding(0,3,12,3);grid.Controls.Add(key,1,1);B(pickKey,"Wybierz plik…");pickKey.Dock=DockStyle.Fill;grid.Controls.Add(pickKey,2,1);
  grid.Controls.Add(backupCaption=L("Backup folder"),0,2);backup.Text=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),"iDrive7-Multitouch","Backups");backup.Dock=DockStyle.Fill;backup.Margin=new Padding(0,3,12,3);grid.Controls.Add(backup,1,2);B(pickFolder,"Wybierz folder…");pickFolder.Dock=DockStyle.Fill;grid.Controls.Add(pickFolder,2,2);
  rootLink.AutoSize=true;rootLink.Margin=new Padding(0,4,0,0);rootLink.LinkColor=blue;grid.Controls.Add(rootLink,1,3);grid.SetColumnSpan(rootLink,2);shell.Controls.Add(grid);
  keyHelp.AutoSize=true;keyHelp.Margin=new Padding(0,4,0,0);keyHelp.LinkColor=blue;keyHelp.Font=new Font("Segoe UI",9);grid.Controls.Add(keyHelp,0,3);
  var facts=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=2,Padding=new Padding(2,13,2,4)};facts.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,75));facts.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,25));
  connection.Dock=DockStyle.Fill;connection.Font=new Font("Segoe UI",11,FontStyle.Bold);facts.Controls.Add(connection,0,0);voltage.Dock=DockStyle.Fill;voltage.TextAlign=ContentAlignment.TopRight;voltage.Font=new Font("Segoe UI",11,FontStyle.Bold);facts.Controls.Add(voltage,1,0);state.Dock=DockStyle.Fill;state.ForeColor=muted;facts.Controls.Add(state,0,1);facts.SetColumnSpan(state,2);shell.Controls.Add(facts);
  var actions=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=true};actions.Controls.Add(B(install,"Zainstaluj",true));actions.Controls.Add(B(remove,"Usuń poprawkę"));actions.Controls.Add(B(restore,"Przywróć kopię"));actions.Controls.Add(B(save,"Zrób kopię"));actions.Controls.Add(B(open,"Otwórz kopie"));
  ready.AutoSize=true;ready.Margin=new Padding(0,0,15,0);activate.AutoSize=true;activate.Checked=true;activate.Margin=new Padding(0);actions.Controls.Add(ready);actions.Controls.Add(activate);shell.Controls.Add(actions);
  var statusPanel=new Panel{Dock=DockStyle.Fill};step.Dock=DockStyle.Top;step.Height=25;step.Font=new Font("Segoe UI",11,FontStyle.Bold);progress.Dock=DockStyle.Bottom;progress.Height=5;progress.Style=ProgressBarStyle.Continuous;statusPanel.Controls.Add(step);statusPanel.Controls.Add(progress);shell.Controls.Add(statusPanel);
  log.Dock=DockStyle.Fill;log.ReadOnly=true;log.BackColor=Color.White;log.BorderStyle=BorderStyle.None;log.Font=new Font("Consolas",9);log.DetectUrls=false;shell.Controls.Add(log);
  copyNote.Dock=DockStyle.Fill;copyNote.ForeColor=muted;copyNote.Font=new Font("Segoe UI",9);copyNote.Padding=new Padding(0,8,0,0);shell.Controls.Add(copyNote);
  var tips=new ToolTip{AutoPopDelay=12000};tips.SetToolTip(host,"Pozostaw puste, aby wykryć auto przez ENET. / Leave blank for ENET discovery.");tips.SetToolTip(key,"Pozostaw puste: automatyczne szukanie klucza dla VIN i próba agenta SSH. Wybierz plik tylko jeśli auto-logowanie nie działa. / Leave blank for VIN-specific key discovery and SSH agent/default authentication. Choose a file only if automatic login fails.");
  tips.SetToolTip(activate,"Pełny restart MGU i automatyczna kontrola po 60 sekundach. Box może wymagać własnego restartu po uruchomieniu MGU. / Full MGU reboot and 60-second health check; an AI box may need its own restart.");
  logFile=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"iDrive7Multitouch","Logs",DateTime.UtcNow.ToString("yyyyMMdd-HHmmss")+".log");Directory.CreateDirectory(Path.GetDirectoryName(logFile));
  language.Click+=(s,e)=>{en=!en;Translate();if(session!=null&&session.Probe!=null)RefreshState();};
  pickKey.Click+=(s,e)=>{using(var d=KeyHelpForm.KeyDialog(en))if(d.ShowDialog()==DialogResult.OK){try{KeyResolver.ValidatePrivateKeyFile(d.FileName);key.Text=d.FileName;}catch(Exception ex){MessageBox.Show(this,ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Information);}}};
  keyHelp.LinkClicked+=(s,e)=>{using(var d=new KeyHelpForm(en))if(d.ShowDialog(this)==DialogResult.OK)key.Text=d.SelectedKey;};
  pickFolder.Click+=(s,e)=>{using(var d=new FolderBrowserDialog{SelectedPath=backup.Text})if(d.ShowDialog()==DialogResult.OK)backup.Text=d.SelectedPath;};
  rootLink.LinkClicked+=(s,e)=>Process.Start(new ProcessStartInfo(Session.RootHelp){UseShellExecute=true});
  open.Click+=(s,e)=>{Directory.CreateDirectory(backup.Text);Process.Start(new ProcessStartInfo(backup.Text){UseShellExecute=true});};
  host.TextChanged+=(s,e)=>InvalidateConnection();key.TextChanged+=(s,e)=>InvalidateConnection();ready.CheckedChanged+=(s,e)=>Buttons();
  connect.Click+=async(s,e)=>await Execute(T("Sprawdzanie ENET i roota…","Checking ENET and root…"),()=>{
   var v=Network.Discover(inputHost);Log("ENET: "+v.Host+" | VIN: "+(v.Vin==""?"—":v.Vin));
   session=new Session(v,inputKey,inputBackup,Log,Trust);session.Connect();return session.Probe;
  },true);
  save.Click+=async(s,e)=>await Execute(T("Tworzenie kopii…","Creating backup…"),()=>{NeedSession();session.BackupFolder=inputBackup;lastBackup=session.Backup();return session.Probe;});
  install.Click+=async(s,e)=>await Execute(T("Kopia i instalacja…","Backup and installation…"),()=>Change("install",true));
  remove.Click+=async(s,e)=>await Execute(T("Kopia i usuwanie…","Backup and removal…"),()=>Change("uninstall",false));
  restore.Click+=async(s,e)=>{
   using(var d=new OpenFileDialog{Title=T("Wybierz kopię CarPlay","Choose CarPlay backup"),Filter="CarPlay backup|*.mgubak",InitialDirectory=backup.Text})if(d.ShowDialog()==DialogResult.OK){string f=d.FileName;await Execute(T("Przywracanie poprzedniego stanu…","Restoring previous state…"),()=>{
    NeedSession();RequireReady();session.RequirePower();var b=Session.ReadBackup(f);bool patched=Json.Bool(Json.Obj(b,"state"),"wasInstalled");session.BackupFolder=inputBackup;session.Restore(f);lastBackup=session.LastBackup;
    if(inputActivate){session.Activate(patched);session.Probe=session.Action("probe");}Log(T("Przywrócono stan instalacji z kopii.","Previous installation state restored."));return session.Probe;
   });}
  };
  FormClosing+=(s,e)=>{if(!busy&&!previewMode)SaveSettings();if(busy){e.Cancel=true;MessageBox.Show(T("Poczekaj na zakończenie bieżącej operacji.","Wait for the current operation to finish."),Text,MessageBoxButtons.OK,MessageBoxIcon.Information);}};
  LoadSettings();Translate();Buttons();
 }

 string SettingsPath(){return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"iDrive7Multitouch","settings.json");}
 void SaveSettings(){try{string p=SettingsPath();Directory.CreateDirectory(Path.GetDirectoryName(p));File.WriteAllText(p,Json.Write(new{host=host.Text,keyPath=key.Text,backupFolder=backup.Text,english=en,activate=activate.Checked}),Encoding.UTF8);}catch{}}
 void LoadSettings(){try{if(!File.Exists(SettingsPath()))return;var d=Json.Parse(File.ReadAllText(SettingsPath(),Encoding.UTF8));host.Text=Json.Str(d,"host");key.Text=Json.Str(d,"keyPath");string b=Json.Str(d,"backupFolder");if(b!="")backup.Text=b;if(d.ContainsKey("english"))en=Json.Bool(d,"english");if(d.ContainsKey("activate"))activate.Checked=Json.Bool(d,"activate");}catch{}}
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h,int m,IntPtr w,string text);
 protected override void OnShown(EventArgs e){base.OnShown(e);Cues();}
 void Cues(){if(key.IsHandleCreated)SendMessage(key.Handle,0x1501,IntPtr.Zero,T("Auto — klucz dla VIN / agent SSH","Auto — VIN key / SSH agent"));if(host.IsHandleCreated)SendMessage(host.Handle,0x1501,IntPtr.Zero,T("Automatyczne wykrywanie ENET","Automatic ENET discovery"));}
 void Translate(){
  language.Text=en?"English / PL":"Polski / EN";hostCaption.Text=T("IP MGU (auto)","MGU IP (auto)");keyCaption.Text=T("Klucz SSH (opcjonalny)","SSH key (optional)");backupCaption.Text=T("Folder kopii","Backup folder");
  subtitle.Text=T("Multitouch · ENET · sprawdzenie roota · kopia przed każdą zmianą","Multitouch · ENET · root check · backup before every change");
  keyHelp.Text=T("Gdzie jest klucz?","Where is my key?");rootLink.Text=T("Instrukcja root / SSH autora na GitHubie ↗","Author's root / SSH setup guide on GitHub ↗");
  connect.Text=T("Połącz i sprawdź","Connect and check");pickKey.Text=T("Wybierz plik…","Choose file…");pickFolder.Text=T("Wybierz folder…","Choose folder…");install.Text=T("Zainstaluj","Install");remove.Text=T("Usuń poprawkę","Uninstall");restore.Text=T("Przywróć kopię","Restore backup");save.Text=T("Zrób kopię","Create backup");open.Text=T("Otwórz kopie","Open backups");
  ready.Text=T("Auto zaparkowane, stabilne zasilanie ≥13 V","Vehicle parked, stable supply ≥13 V");activate.Text=T("Restart i kontrola po operacji","Reboot and verify afterwards");
  copyNote.Text=T("Kopia na komputerze obejmuje CarPlay i konfigurację poprawki. Nie jest pełnym obrazem MGU.","PC backup covers CarPlay and patch configuration. It is not a full MGU image.");
  Cues();
  if(session==null){connection.Text=T("Niepołączono","Not connected");state.Text=T("Podłącz ENET i kliknij Połącz i sprawdź. Logowanie SSH jest wykrywane automatycznie.","Connect ENET and click Connect and check. SSH authentication is detected automatically.");voltage.Text="— V";step.Text=T("Gotowy do połączenia","Ready to connect");}
 }
 void InvalidateConnection(){if(!busy){session=null;Translate();Buttons();}}
 void NeedSession(){if(session==null||session.Probe==null)throw new Exception(T("Najpierw kliknij Połącz i sprawdź.","Connect and check first."));}
 void RequireReady(){if(!inputReady)throw new Exception(T("Potwierdź postój i stabilne zasilanie.","Confirm parked vehicle and stable supply."));}
 object Change(string action,bool patched){
  NeedSession();RequireReady();session.RequirePower();session.BackupFolder=inputBackup;lastBackup=session.Backup();
  SetStep(T("Kopia sprawdzona. Zapisywanie zmiany…","Backup verified. Applying change…"));var result=session.Action(action);Log(Json.Write(result));
  if(inputActivate){SetStep(T("Ponowne uruchamianie i kontrola MGU…","Rebooting and verifying MGU…"));session.Activate(patched);session.Probe=session.Action("probe");}
  else{session.Probe=session.Action("probe");Log(T("Zmiana zapisana na następny pełny restart MGU.","Change saved for the next full MGU reboot."));}
  return session.Probe;
 }
 async Task Execute(string title,Func<object> work,bool showReady=false){
  if(busy)return;SaveSettings();inputHost=host.Text;inputKey=key.Text;inputBackup=backup.Text;inputReady=ready.Checked;inputActivate=activate.Checked;busy=true;Buttons();SetStep(title);progress.Style=ProgressBarStyle.Marquee;Log(title);
  try{await Task.Run(work);RefreshState();SetStep(showReady&&session!=null&&Json.Bool(session.Probe,"supported")?T("Gotowy do instalacji CarPlay Multitouch dla iDrive 7","Ready to install CarPlay Multitouch for iDrive 7"):T("Zakończono","Completed"));}
  catch(Exception e){string message=e is AggregateException?e.GetBaseException().Message:e.Message;if(message.Contains("Permission denied")||message.Contains("invalid format")||message.Contains("Load key"))message=T("Nie udało się zalogować jako root. Sprawdź prywatny klucz SSH; odnośnik do instrukcji jest w oknie. To może być nieprawidłowy klucz, a nie brak roota.","Root login failed. Check your SSH private key; setup instructions are linked in the window. Authentication failure can mean a wrong key, not missing root.")+"\n\n"+message;Log("BŁĄD / ERROR: "+message);SetStep(T("Operacja zatrzymana — sprawdź komunikat","Operation stopped — inspect the message"));MessageBox.Show(message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
  finally{busy=false;progress.Style=ProgressBarStyle.Continuous;Buttons();}
 }
 bool Trust(string message){if(InvokeRequired)return (bool)Invoke(new Func<string,bool>(Trust),message);return MessageBox.Show(message,Text,MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2)==DialogResult.Yes;}
 void SetStep(string text){if(InvokeRequired){BeginInvoke(new Action<string>(SetStep),text);return;}step.Text=text;}
 void Log(string text){if(InvokeRequired){BeginInvoke(new Action<string>(Log),text);return;}string line=DateTime.Now.ToString("HH:mm:ss")+"  "+text+Environment.NewLine;log.AppendText(line);log.ScrollToCaret();try{File.AppendAllText(logFile,line,Encoding.UTF8);}catch{}}
 void RefreshState(){
  if(session==null||session.Probe==null)return;var p=session.Probe;connection.Text="VIN: "+(session.Vehicle.Vin==""?"—":session.Vehicle.Vin)+"   ·   "+session.Vehicle.Host;
  var s=Json.Obj(p,"status");var v=Json.Obj(p,"voltage");var value=v==null?null:Json.Obj(v,"value");
  voltage.Text=value!=null&&value.ContainsKey("STAT_MILLI_VOLT_WERT")?(Convert.ToDouble(value["STAT_MILLI_VOLT_WERT"])/1000).ToString("0.0")+" V":"— V";
  voltage.ForeColor=value!=null&&value.ContainsKey("STAT_MILLI_VOLT_WERT")&&Convert.ToInt32(value["STAT_MILLI_VOLT_WERT"])>=13000?Color.FromArgb(30,122,83):Color.FromArgb(174,93,24);
  if(!Json.Bool(p,"supported")){state.Text=T("Root OK · niezgodna wersja MGU — instalacja zablokowana.","Root OK · unsupported MGU build — installation blocked.");state.ForeColor=Color.FromArgb(174,93,24);Log(Json.Str(p,"compatibilityError"));}
  else if(Json.Bool(s,"activePatched")&&Json.Obj(s,"pending")==null&&Json.Bool(Json.Obj(s,"health"),"verified")){state.Text=T("Root OK · zgodna wersja · CarPlay Multitouch zainstalowany i sprawdzony.","Root OK · compatible build · CarPlay Multitouch installed and health verified.");state.ForeColor=Color.FromArgb(30,122,83);}
  else if(Json.Obj(s,"disabled")!=null){state.Text=T("Root OK · poprawka wyłączona przez zabezpieczenie. Można usunąć lub ponowić instalację.","Root OK · guard disabled the patch. Uninstall or retry installation.");state.ForeColor=Color.FromArgb(174,93,24);}
  else{state.Text=T("Root OK · zgodna wersja. Zmiana zapisana na dysku może wymagać restartu.","Root OK · compatible build. A change saved on disk may require reboot.");state.ForeColor=muted;}
  state.Text+=T("  iPhone bezpośrednio: niesprawdzone.","  Direct iPhone CarPlay: untested.");
 }
 void Buttons(){
  bool connected=session!=null&&session.Probe!=null,supported=connected&&Json.Bool(session.Probe,"supported");var s=connected?Json.Obj(session.Probe,"status"):null;
  foreach(var c in new Control[]{connect,pickKey,pickFolder,host,key,backup,language,ready,activate,rootLink,keyHelp})c.Enabled=!busy;
  bool healthy=connected&&Json.Bool(s,"activePatched")&&Json.Obj(s,"disabled")==null&&Json.Obj(s,"pending")==null&&Json.Bool(Json.Obj(s,"health"),"verified");install.Text=healthy?T("Zainstalowano","Installed"):T("Zainstaluj","Install");save.Enabled=!busy&&supported;install.Enabled=!busy&&supported&&ready.Checked&&!healthy;remove.Enabled=!busy&&connected&&Json.Bool(s,"installed")&&ready.Checked;restore.Enabled=!busy&&supported&&ready.Checked;open.Enabled=!busy;
 }
 public void RenderPreview(string path){
  RenderPreview(path,true,"ready");
 }
 public void RenderPreview(string path,bool english,string stage){
  previewMode=true;en=english;Translate();
  host.Text="";key.Text="";backup.Text=@"C:\Backups\iDrive7";ready.Checked=false;activate.Checked=true;log.Clear();
  Log(T("PODGLĄD INSTRUKCJI — dane przykładowe, bez połączenia z autem.","GUIDE PREVIEW — example data; no vehicle connection."));
  if(stage=="ready"){
  host.Text="169.254.50.55";key.Text=@"C:\Keys\BMW\id_rsa";ready.Checked=true;
  connection.Text=T("ENET połączony   ·   root potwierdzony","ENET connected   ·   root verified");state.Text=T("Zgodna wersja MGU · kopia będzie zapisana przed instalacją","Compatible MGU build · backup will be saved before installation");voltage.Text="14.4 V";voltage.ForeColor=Color.FromArgb(30,122,83);step.Text=T("Gotowy do instalacji CarPlay Multitouch dla iDrive 7","Ready to install CarPlay Multitouch for iDrive 7");
  Log(T("ENET → MGU: połączenie sprawdzone","ENET → MGU: connection verified"));Log(T("SSH: UID 0 (root) potwierdzony","SSH: UID 0 (root) verified"));Log(T("Wersja fabrycznego CarPlay zgodna z poprawką","Factory CarPlay software matches the patch"));
  foreach(var b in new[]{install,remove,restore,save})b.Enabled=true;
  }
  Show();Application.DoEvents();using(var bitmap=new Bitmap(Width,Height)){DrawToBitmap(bitmap,new Rectangle(0,0,Width,Height));bitmap.Save(path,System.Drawing.Imaging.ImageFormat.Png);}Close();
 }
}
static class Program {
 [STAThread] static int Main(string[] args){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  if(args.Length==2&&args[0]=="--render-key-help"){using(var f=new KeyHelpForm(true))f.RenderPreview(args[1]);return 0;}
  if(args.Length==2&&args[0]=="--render-key-help-pl"){using(var f=new KeyHelpForm(false))f.RenderPreview(args[1]);return 0;}
  if(args.Length==4&&args[0]=="--render-guide"){using(var f=new MainForm())f.RenderPreview(args[1],args[2]!="pl",args[3]);return 0;}
  if(args.Length==2&&args[0]=="--render"){using(var f=new MainForm())f.RenderPreview(args[1]);return 0;}
  Application.Run(new MainForm());return 0;
 }
}
}

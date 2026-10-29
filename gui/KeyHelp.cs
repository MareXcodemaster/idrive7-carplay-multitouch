using System;using System.Drawing;using System.Windows.Forms;using System.Diagnostics;
namespace MguInstaller {
public class KeyHelpForm:Form {
 public string SelectedKey {get;private set;}
 readonly bool english;
 string T(string pl,string en){return english?en:pl;}
 public static OpenFileDialog KeyDialog(bool en) {return new OpenFileDialog{Title=en?"Select the exported id_rsa (no extension)":"Wybierz wyeksportowany id_rsa (bez rozszerzenia)",Filter="Exported OpenSSH key (id_rsa)|id_rsa;id_ed25519;id_rsa.pkcs1.pem;id_rsa.pkcs8.pem|Other private key files|*.pem;*.key|All files|*.*",CheckFileExists=true};}
 public KeyHelpForm(bool en) {
  english=en;Text=T("Gdzie jest klucz SSH?","Where is my SSH key?");Size=new Size(770,590);MinimumSize=Size;StartPosition=FormStartPosition.CenterParent;MaximizeBox=false;MinimizeBox=false;
  Font=new Font("Segoe UI",10);BackColor=Color.FromArgb(243,246,251);ForeColor=Color.FromArgb(24,39,62);
  var layout=new TableLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(23),ColumnCount=1,RowCount=6};
  foreach(int h in new[]{45,118,80,79})layout.RowStyles.Add(new RowStyle(SizeType.Absolute,h));layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,44));Controls.Add(layout);
  layout.Controls.Add(new Label{Text=T("Po rootowaniu: wybierz zapisany klucz","After rooting: select the saved key"),Dock=DockStyle.Fill,Font=new Font("Segoe UI",17,FontStyle.Bold)});
  layout.Controls.Add(new Label{Dock=DockStyle.Fill,Text=T("1. Po udanym Enable SSH / Flash zachowaj folder narzędzia autora.\r\n2. Otwórz folder z MGU-SSH.exe, potem data → enrollments → VIN Twojego auta.\r\n3. W naszym instalatorze kliknij Choose file…, wybierz id_rsa i kliknij Connect and check.","1. After successful Enable SSH / Flash, keep the author's tool folder.\r\n2. Open the folder containing MGU-SSH.exe, then data → enrollments → your car's VIN.\r\n3. In this installer click Choose file…, select id_rsa, then click Connect and check.")});
  var paths=new TextBox{Dock=DockStyle.Fill,ReadOnly=true,Multiline=true,BorderStyle=BorderStyle.FixedSingle,BackColor=Color.White,Font=new Font("Consolas",10),Text=T("Folder z MGU-SSH.exe:\r\n  data\\enrollments\\<VIN>\\id_rsa\r\nBuild EXE: dist\\MGU-SSH\\data\\enrollments\\<VIN>\\id_rsa","Next to MGU-SSH.exe:\r\n  data\\enrollments\\<VIN>\\id_rsa\r\nEXE build: dist\\MGU-SSH\\data\\enrollments\\<VIN>\\id_rsa")};layout.Controls.Add(paths);
  layout.Controls.Add(new Label{Dock=DockStyle.Fill,Padding=new Padding(0,10,0,0),Text=T("Uruchamianie ze źródeł: ta sama ścieżka data\\enrollments\\<VIN>\\id_rsa w folderze repozytorium. W tym samym folderze connect.txt zawiera IP MGU i polecenie SSH.","Running from source: the same data\\enrollments\\<VIN>\\id_rsa path is inside the repository folder. The adjacent connect.txt contains the MGU IP and an SSH command.")});
  layout.Controls.Add(new Label{Dock=DockStyle.Fill,Text=T("Wybierz id_rsa BEZ rozszerzenia. Nie wybieraj id_rsa.pub (klucz publiczny), id_rsa.ppk (PuTTY) ani 01_PRIVATE_KEY.pem (enrollment). Nie generuj nowego klucza. Zachowaj folder narzędzia do rootowania; instalator nie zawiera ani nie udostępnia kluczy.","Choose id_rsa with NO extension. Do not select id_rsa.pub (public), id_rsa.ppk (PuTTY), or 01_PRIVATE_KEY.pem (enrollment). Do not generate a new key. Keep the rooting tool folder; this installer does not bundle or share keys.")});
  var buttons=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false};
  var choose=new Button{Text=T("Wybierz id_rsa…","Choose id_rsa…"),Width=155,Height=35,FlatStyle=FlatStyle.Flat,BackColor=Color.FromArgb(19,110,194),ForeColor=Color.White};
  choose.Click+=(s,e)=>{using(var d=KeyDialog(english))if(d.ShowDialog(this)==DialogResult.OK){try{KeyResolver.ValidatePrivateKeyFile(d.FileName);SelectedKey=d.FileName;DialogResult=DialogResult.OK;Close();}catch(Exception ex){MessageBox.Show(this,ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Information);}}};
  var guide=new Button{Text=T("Instrukcja autora ↗","Author's key instructions ↗"),Width=225,Height=35};guide.Click+=(s,e)=>Process.Start(new ProcessStartInfo(Session.RootKeyHelp){UseShellExecute=true});
  var close=new Button{Text=T("Zamknij","Close"),Width=95,Height=35,DialogResult=DialogResult.Cancel};buttons.Controls.Add(choose);buttons.Controls.Add(guide);buttons.Controls.Add(close);layout.Controls.Add(buttons);CancelButton=close;
 }
 public void RenderPreview(string path){Show();Application.DoEvents();using(var bitmap=new Bitmap(Width,Height)){DrawToBitmap(bitmap,new Rectangle(0,0,Width,Height));bitmap.Save(path,System.Drawing.Imaging.ImageFormat.Png);}Close();}
}
}

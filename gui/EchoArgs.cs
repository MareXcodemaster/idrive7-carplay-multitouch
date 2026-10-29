using System;using System.Web.Script.Serialization;
class EchoArgs{static void Main(string[] args){Console.Write(new JavaScriptSerializer().Serialize(args));}}

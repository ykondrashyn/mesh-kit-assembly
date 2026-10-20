from pathlib import Path
import json
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString
from OCP.XCAFDoc import XCAFDoc_DocumentTool
from OCP.TDF import TDF_LabelSequence, TDF_Label
from OCP.TDataStd import TDataStd_Name
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
sources={'wio':ROOT/'references/wio-sx1262-for-xiao.step','xiao':ROOT/'references/xiao-esp32s3-model/XIAO-ESP32S3 v2.step'}
def bbox(s):
 b=Bnd_Box()
 BRepBndLib.Add_s(s,b)
 return [round(v,4) for v in b.Get()]
for name,path in sources.items():
 doc=TDocStd_Document(TCollection_ExtendedString('doc'))
 reader=STEPCAFControl_Reader()
 reader.SetNameMode(True)
 reader.ReadFile(str(path))
 reader.Transfer(doc)
 st=XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
 labels=TDF_LabelSequence()
 st.GetFreeShapes(labels)
 def show(label,depth=0):
  attr=TDataStd_Name()
  nm='?'
  if label.FindAttribute(TDataStd_Name.GetID_s(),attr):nm=attr.Get().ToExtString()
  shp=st.GetShape_s(label)
  print(' '*depth,nm, 'bbox=',bbox(shp),flush=True)
  refs=TDF_LabelSequence()
  st.GetComponents_s(label,refs)
  for i in range(1,refs.Length()+1):
   ref=refs.Value(i)
   attr=TDataStd_Name()
   rnm='?'
   if ref.FindAttribute(TDataStd_Name.GetID_s(),attr):rnm=attr.Get().ToExtString()
   print(' '*(depth+1),'component',rnm,'bbox=',bbox(st.GetShape_s(ref)),flush=True)
   target=TDF_Label()
   if st.GetReferredShape_s(ref,target):show(target,depth+2)
 for i in range(1,labels.Length()+1):show(labels.Value(i))

from pathlib import Path
import json,math
from OCP.STEPControl import STEPControl_Reader
from OCP.gp import gp_Trsf,gp_Pnt,gp_Dir,gp_Ax2,gp_Vec
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.BRep import BRep_Builder,BRep_Tool
from OCP.TopoDS import TopoDS_Compound,TopoDS
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_EDGE,TopAbs_FACE
from OCP.HLRBRep import HLRBRep_Algo,HLRBRep_HLRToShape
from OCP.HLRAlgo import HLRAlgo_Projector
from OCP.BRepLib import BRepLib
from OCP.BRepAdaptor import BRepAdaptor_Curve,BRepAdaptor_Surface
from OCP.GCPnts import GCPnts_QuasiUniformDeflection
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopLoc import TopLoc_Location
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox,BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from shapely.geometry import Polygon
from shapely.ops import unary_union
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
U=(.8660254038,-.5,0)
V=(-.3535533906,-.6123724357,-.7071067812)
NORMAL=(-.3535533906,-.6123724357,.7071067812)

def tr(shape,m):
 t=gp_Trsf();t.SetValues(*m)
 return BRepBuilderAPI_Transform(shape,t,True).Shape()
def move(s,x,y,z):return tr(s,[1,0,0,x,0,1,0,y,0,0,1,z])
def load(name):
 p=ROOT/'references'/('wio-sx1262-for-xiao.step' if name=='wio' else 'xiao-esp32s3-model/XIAO-ESP32S3 v2.step')
 r=STEPControl_Reader();r.ReadFile(str(p));r.TransferRoots();s=r.OneShape()
 if name=='wio':return tr(s,[-1,0,0,123.2916,0,-1,0,-110.3625,0,0,1,0])
 return tr(s,[0,0,-1,2.7786,-1,0,0,12.2817,0,1,0,.25])
def compound(shapes):
 b=BRep_Builder();c=TopoDS_Compound();b.MakeCompound(c)
 for s in shapes:b.Add(c,s)
 return c

def box(x,y,z,dx,dy,dz):return BRepPrimAPI_MakeBox(gp_Pnt(x,y,z),dx,dy,dz).Shape()
def cyl(x,y,z,r,h):return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x,y,z),gp_Dir(0,0,1)),r,h).Shape()

def supplement_xiao(s):
 # Socket depicted schematically from kit reference. Center aligned with underside Wio connector.
 a=box(2.4307,17.6884,1.25,8.6,3.4344,.95)
 b=box(3.05,18.24,1.50,7.35,2.3,.85)
 socket=BRepAlgoAPI_Cut(a,b).Shape()
 parts=[s,socket]
 for x in [1.27,16.51]:
  parts.append(box(x-1.22,1.651,-2.2,2.44,17.78,2.2))
  for i in range(7):parts.append(box(x-.32,2.921+2.54*i-.32,-6.2,.64,.64,6.3))
 return compound(parts)
def supplement_wio(s):
 return compound([s,box(7.00,6.72,1.60,3.78,2.70,.55),cyl(8.89,8.07,2.15,.93,.45)])

def proj(p,u=U,v=V):return (sum(a*b for a,b in zip(p,u)),sum(a*b for a,b in zip(p,v)))
def silhouette(s,u,v):
 BRepMesh_IncrementalMesh(s,.04,False,.25,True)
 it=TopExp_Explorer(s,TopAbs_FACE);polys=[]
 while it.More():
  f=TopoDS.Face_s(it.Current());loc=TopLoc_Location();m=BRep_Tool.Triangulation_s(f,loc)
  if m:
   pts=[proj(m.Node(i).Transformed(loc.Transformation()).Coord(),u,v) for i in range(1,m.NbNodes()+1)]
   for i in range(1,m.NbTriangles()+1):
    ids=m.Triangle(i).Get();p=Polygon([pts[j-1] for j in ids])
    if p.area>1e-10:polys.append(p)
  it.Next()
 return unary_union(polys).buffer(.002).simplify(.008)
def paths_edges(s,normal,u):
 algo=HLRBRep_Algo();algo.Add(s);algo.Projector(HLRAlgo_Projector(gp_Ax2(gp_Pnt(0,0,0),gp_Dir(*normal),gp_Dir(*u))));algo.Update();algo.Hide()
 result=HLRBRep_HLRToShape(algo)
 edges=[];seen=set()
 for shp in [result.VCompound(),result.OutLineVCompound()]:
  if shp.IsNull():continue
  BRepLib.BuildCurves3d_s(shp)
  it=TopExp_Explorer(shp,TopAbs_EDGE)
  while it.More():
   e=TopoDS.Edge_s(it.Current())
   try:
    cur=BRepAdaptor_Curve(e);d=GCPnts_QuasiUniformDeflection(cur,.015)
    if d.IsDone():pts=[(d.Value(i).X(),-d.Value(i).Y()) for i in range(1,d.NbPoints()+1)]
    else:pts=[(cur.Value(t).X(),-cur.Value(t).Y()) for t in [cur.FirstParameter(),cur.LastParameter()]]
    key=tuple((round(x,3),round(y,3)) for x,y in pts)
    if key not in seen and tuple(reversed(key)) not in seen:edges.append(pts);seen.add(key)
   except Exception:pass
   it.Next()
 return edges

def render(name,s,landmarks,u=U,v=V,normal=NORMAL):
 print('Rendering',name,flush=True)
 sil=silhouette(s,u,v)
 xmin,ymin,xmax,ymax=sil.bounds
 scale=22.;pad=8.;w=(xmax-xmin)*scale+2*pad;h=(ymax-ymin)*scale+2*pad
 def pixel(p):return [(p[0]-xmin)*scale+pad,(p[1]-ymin)*scale+pad]
 def dpath(ps,close=False):
  q=[pixel(p) for p in ps]
  return 'M'+' L'.join(f'{x:.2f},{y:.2f}' for x,y in q)+('Z' if close else '')
 shapes=list(sil.geoms) if hasattr(sil,'geoms') else [sil]
 silhouettes=[]
 for poly in shapes:
  if poly.geom_type!='Polygon':continue
  ds=dpath(poly.exterior.coords,True)
  for ring in poly.interiors:ds+=dpath(ring.coords,True)
  silhouettes.append(f'<path d="{ds}" fill="#fbfbfa" fill-rule="evenodd" stroke="#171c23" stroke-width="1.3"/>')
 paths=paths_edges(s,normal,u)
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.2f}" height="{h:.2f}" viewBox="0 0 {w:.2f} {h:.2f}">'
 svg+=''.join(silhouettes)
 svg+='<g fill="none" stroke="#171c23" stroke-width=".9" stroke-linejoin="round" stroke-linecap="round">'
 svg+=''.join(f'<path d="{dpath(ps)}"/>' for ps in paths if len(ps)>1)+'</g></svg>'
 (OUT/(name+'.svg')).write_text(svg)
 data={'svg':str(OUT/(name+'.svg')),'width':w,'height':h,'mm_to_px':scale,'projected_bounds_mm':[xmin,ymin,xmax,ymax],'landmarks':{key:pixel(proj(pos,u,v)) for key,pos in landmarks.items()},'landmarks_3d_mm':landmarks,'projection_u':u,'projection_v':v}
 (OUT/(name+'.json')).write_text(json.dumps(data,indent=2))
 print(name,'done',len(paths),'edges',w,h,flush=True)
 return data

if __name__=='__main__':
 x=load('xiao');w=load('wio')
 xlm={'rf':[13.617,19.233,2.5],'b2b':[6.7307,19.4056,2.2],'usb':[8.89,-1.527,2.36],'shield_center':[8.89,12.01,3.25]}
 wlm={'rf':[5.3984,19.4793,2.9],'b2b':[6.731,19.406,-3.50],'button':[8.89,8.07,2.6],'shield_center':[8.89,15.40,3.8]}
 all={}
 for nm,s,lm in [('xiao',supplement_xiao(x),xlm),('wio',supplement_wio(w),wlm)]:
  all[nm]=render(nm+'-iso',s,lm)
  all[nm+'_top']=render(nm+'-top',s,lm,(1,0,0),(0,-1,0),(0,0,1))
  all[nm+'_bottom']=render(nm+'-bottom',s,lm,(1,0,0),(0,1,0),(0,0,-1))
 for spacing,tag in [(5.0,'stack'),(17.0,'exploded')]:
  combined=compound([supplement_xiao(x),move(supplement_wio(w),0,0,spacing)])
  lm={'xiao_rf':xlm['rf'],'xiao_b2b':xlm['b2b'],'wio_rf':[wlm['rf'][0],wlm['rf'][1],wlm['rf'][2]+spacing],'wio_b2b':[wlm['b2b'][0],wlm['b2b'][1],wlm['b2b'][2]+spacing],'usb':xlm['usb']}
  all[tag]=render(tag+'-iso',combined,lm)
 (OUT/'assets.json').write_text(json.dumps(all,indent=2))

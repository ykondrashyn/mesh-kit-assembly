from render_native import *
from OCP.GeomAbs import GeomAbs_Cylinder
for name in ['xiao','wio']:
 s=load(name)
 it=TopExp_Explorer(s,TopAbs_FACE)
 cs=set()
 while it.More():
  face=TopoDS.Face_s(it.Current());a=BRepAdaptor_Surface(face)
  if a.GetType()==GeomAbs_Cylinder:
   c=a.Cylinder();p=c.Location();r=c.Radius();d=c.Axis().Direction()
   if abs(d.Z())>.98 and r>.2:cs.add(tuple(round(v,4) for v in [p.X(),p.Y(),p.Z(),r]))
  it.Next()
 print(name,sorted(cs))

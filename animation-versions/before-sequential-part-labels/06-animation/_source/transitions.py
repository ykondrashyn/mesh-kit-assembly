"""Native Blender fades on the white instructional background."""
import bpy


def smoother(t, start, end):
    u=min(1,max(0,(t-start)/(end-start)))
    return u*u*u*(u*(u*6-15)+10)


def envelope(t,start,end,fade_in=.30,fade_out=.35):
    a=1 if start is None else smoother(t,start,start+fade_in)
    b=1 if end is None else 1-smoother(t,end-fade_out,end)
    return a*b


class WhiteFade:
    """Dissolve native artwork into white without transparency sorting noise."""
    def __init__(self,name,objects,transparent=False):
        self.objects=objects
        self.controls=[]
        copies={}
        for ob in objects:
            if not hasattr(ob.data,'materials'):
                continue
            ob.data=ob.data.copy()
            for slot in ob.material_slots:
                source=slot.material
                if not source:
                    continue
                if source not in copies:
                    mat=source.copy()
                    mat.name=name+' / '+source.name
                    nodes=mat.node_tree.nodes
                    links=mat.node_tree.links
                    output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
                    original=output.inputs['Surface'].links[0].from_socket
                    white=nodes.new('ShaderNodeBsdfTransparent' if transparent else 'ShaderNodeEmission')
                    white.inputs['Color'].default_value=(1,1,1,1)
                    if transparent:
                        mat.surface_render_method='DITHERED'
                    mix=nodes.new('ShaderNodeMixShader')
                    mix.name='White fade'
                    mix.label='Artwork visibility, 0 = white, 1 = full'
                    links.new(white.outputs[0],mix.inputs[1])
                    links.new(original,mix.inputs[2])
                    links.new(mix.outputs[0],output.inputs['Surface'])
                    copies[source]=mat
                    self.controls.append(mix.inputs[0])
                slot.material=copies[source]
            ob['fade_group']=name

    def set(self,amount,frame):
        amount=min(1,max(0,amount))
        for control in self.controls:
            control.default_value=amount
            control.keyframe_insert(data_path='default_value',frame=frame)
        for ob in self.objects:
            ob.hide_render=amount<=1e-8
            ob.hide_viewport=ob.hide_render
            ob.keyframe_insert(data_path='hide_render',frame=frame)
            ob.keyframe_insert(data_path='hide_viewport',frame=frame)

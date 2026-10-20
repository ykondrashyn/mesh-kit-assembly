"""Export Blender-rendered pages without an external page-layout application.

The PDF wraps the original RGB PNG compressed pixel streams directly. It does
not redraw, resample, crop or compose any page content. Run this in Blender.
"""
from pathlib import Path
import json
import shutil
import struct

import bpy


def png_stream(path):
    raw = path.read_bytes()
    if raw[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Not PNG: '+str(path))
    pos, compressed = 8, []
    width = height = None
    while pos < len(raw):
        size = struct.unpack('>I',raw[pos:pos+4])[0]
        tag = raw[pos+4:pos+8]
        chunk = raw[pos+8:pos+8+size]
        if tag == b'IHDR':
            width,height,depth,color,_,_,interlace = struct.unpack('>IIBBBBB',chunk)
            if (depth,color,interlace) != (8,2,0):
                raise ValueError('PDF expects non-interlaced 8-bit RGB PNG pages')
        if tag == b'IDAT':
            compressed.append(chunk)
        pos += 12+size
    return width,height,b''.join(compressed)


def write_pdf(paths, destination):
    objects = [None,None]
    page_ids = []
    for path in paths:
        w,h,pixels = png_stream(path)
        if abs(w/h-16/9)>1e-6:
            raise ValueError('Page aspect is not 16:9')
        image_id = len(objects)+1
        objects.append((f'<< /Type /XObject /Subtype /Image /Width {w} /Height {h} '
                        f'/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode '
                        f'/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns {w} >> '
                        f'/Length {len(pixels)} >>\nstream\n').encode()+pixels+b'\nendstream')
        paint = b'q 960 0 0 540 0 0 cm /PageImage Do Q\n'
        content_id = len(objects)+1
        objects.append(f'<< /Length {len(paint)} >>\nstream\n'.encode()+paint+b'endstream')
        page_id = len(objects)+1
        page_ids.append(page_id)
        objects.append((f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] '
                        f'/Resources << /XObject << /PageImage {image_id} 0 R >> >> '
                        f'/Contents {content_id} 0 R >>').encode())
    objects[0] = b'<< /Type /Catalog /Pages 2 0 R >>'
    objects[1] = ('<< /Type /Pages /Count '+str(len(page_ids))+' /Kids ['+
                  ' '.join(f'{i} 0 R' for i in page_ids)+'] >>').encode()
    info_id = len(objects)+1
    objects.append(b'<< /Title (Mesh Kit Assembly - Blender Edition) '
                   b'/Author (YK) /Creator (Blender native scene renders) '
                   b'/Producer (Lossless PNG page wrapper) >>')
    data = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = [0]
    for i,obj in enumerate(objects,1):
        offsets.append(len(data))
        data.extend(f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n')
    xref = len(data)
    data.extend(f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'.encode())
    data.extend(b''.join(f'{n:010d} 00000 n \n'.encode() for n in offsets[1:]))
    data.extend((f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R /Info {info_id} 0 R >>\n'
                 f'startxref\n{xref}\n%%EOF\n').encode())
    destination.write_bytes(data)


def export_outputs(root):
    root = Path(root)
    out = root/'output'
    paths = sorted((out/'pages').glob('0[1-5]-*.png'))
    if len(paths)!=5:
        raise ValueError('Expected all five rendered pages')
    write_pdf(paths,out/'mesh-kit-blender.pdf')
    shutil.copyfile(paths[-1],out/'mesh-kit-all-steps.png')
    img = bpy.data.images.load(str(paths[-1]),check_existing=False)
    img.scale(1600,900)
    img.filepath_raw = str(out/'mesh-kit-preview.png')
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    print('Exported native Blender PNG pages and lossless PDF',flush=True)


if __name__ == '__main__':
    export_outputs(Path(__file__).resolve().parents[1])

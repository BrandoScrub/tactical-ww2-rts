"""Preview of the prop art as the game lays it: line pieces along lines at six angles (with their end pieces),
tank traps, both fighting positions, an olive, a cypress and an outcrop. python3 tools/preview_props.py [out.png]"""
import json, math, sys
from PIL import Image
import os
ROOT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'art')+'/'
P=json.load(open(ROOT+'props.json')); imgs={}
for k,v in P.items():
    imgs[k]=Image.open(ROOT+v['src'])
    for e,r in v.get('ends',{}).items(): imgs[k+'_'+e]=Image.open(ROOT+r['src'])
    if 'front' in v: imgs[k+'_front']=Image.open(ROOT+v['front']['src'])
PXM=22
def frame(k,ang,end=None):
    r=P[k] if not end else (P[k].get('ends',{}).get(end) or P[k][end]); n=r['headings']; span=r['span']; i=round((math.degrees(ang)%span)/span*n)%n
    fw,fh=r['frame']; return imgs[k+('_'+end if end else '')].crop((i*fw,0,(i+1)*fw,fh)), r['anchor']
def scr(x,y,z=0): return ((x-y)*PXM, (x+y)*PXM*.5 - z*24)
W,H=1500,1100; im=Image.new('RGBA',(W,H),(150,140,105,255)); items=[]
rows=[('sandbags',0),('wall',2.2),('hedge',4.4),('wire_us',6.6),('wire_de',8.8)]
angs=[0,20,45,70,90,135]
for ci,a in enumerate(angs):
    for key,row in rows:
        L=4.0; ln=P[key]['len']; n=max(1,round(L/ln)); A=math.radians(a)
        ax=ci*7+0.0+row*0.0; ay=-ci*7+row*1.0*2.5+0; 
        ax,ay=ci*6.5, row*2.6 - ci*6.5 + 0
        for j in range(n):
            t=(j+.5)/n; x=ax+math.cos(A)*L*t; y=ay+math.sin(A)*L*t
            k2=key if key!='hedge' else ('hedge' if j%2 else 'hedge_b')
            e='solo' if n==1 else 'first' if j==0 else 'last' if j==n-1 else None
            items.append((x+y,k2,x,y,A,e))
pt=lambda d,sm: ((sm+d)/2,(sm-d)/2)
for i in range(4): items.append((0,'tanktrap_%d'%(i%3),*pt(6+i*2.2,44),0,None))
for kk,d,a in (('position_us',22,0),('position_de',34,math.pi)): items.append((0,kk,*pt(d,46),a,None)); items.append((0,kk,*pt(d,46),a,'front'))
items.append((0,'olive_0',*pt(45,50),0,None)); items.append((0,'cypress_0',*pt(53,50),0,None)); items.append((0,'outcrop_0',*pt(61,48),0,None))
items=[(x+y+(1.6 if e=='front' else -2.2 if k.startswith('position') else 0),k,x,y,A,e) for _,k,x,y,A,e in items]
items.sort(key=lambda t:t[0])
for d,k,x,y,A,e in items:
    fr,(axp,ayp)=frame(k,A,e); sx,sy=scr(x,y); im.alpha_composite(fr,(int(sx-axp+300),int(sy-ayp+300)))
out=sys.argv[1] if len(sys.argv)>1 else 'docs/previews/props_textured.png'
im.crop((0,260,1500,960)).convert('RGB').save(out); print('wrote', out)

import sys, numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
A=np.load(__import__("os").path.join(__import__("os").environ.get("GEMELO_LIDAR", "hituelo_datos/lidar"), "_alto.npy"))
x0,x1,y0,y1=[float(v) for v in sys.argv[1:5]]; hmin=float(sys.argv[5]); out=sys.argv[6]
m=(A[:,0]>x0)&(A[:,0]<x1)&(A[:,1]>y0)&(A[:,1]<y1)&(A[:,3]>hmin)
fig,ax=plt.subplots(1,2,figsize=(18,9),dpi=60)
sc=ax[0].scatter(A[m,0],A[m,1],s=1.5,c=A[m,3],cmap="turbo",vmin=hmin,vmax=18);ax[0].set_aspect("equal");plt.colorbar(sc,ax=ax[0])
cs=A[m,4].astype(int); cm={4:"#4c4",5:"#0a0",6:"#f33",12:"#fa0",1:"#fff",3:"#8f8"}
ax[1].scatter(A[m,0],A[m,1],s=1.5,c=[cm.get(c,"#888") for c in cs]);ax[1].set_aspect("equal");ax[1].set_facecolor("#222")
plt.tight_layout();plt.savefig(out)
print(m.sum(), {int(k):int((cs==k).sum()) for k in set(cs)})

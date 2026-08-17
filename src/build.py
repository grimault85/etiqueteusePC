import re, json, base64, sys, os
# Travaille depuis le dossier des sources, quelle que soit l'invocation.
os.chdir(os.path.dirname(os.path.abspath(__file__)))
html = open('index.html', encoding='utf-8').read()
def ech(s): return re.sub(r'</script', r'<\\/script', s, flags=re.I)
niimbot = ech(open('niimbot.js',encoding='utf-8').read())
render = open('render.js',encoding='utf-8').read()
render = re.sub(r'^export\s+(async\s+)?function', lambda m:(m.group(1) or '')+'function', render, flags=re.M)
render = ech(re.sub(r'^export\s+const','const',render,flags=re.M))
app = ech(re.sub(r"^import .*?from '\./render\.js';\n",'',open('app.js',encoding='utf-8').read(),flags=re.M))
mf = json.load(open('manifest.webmanifest'))
i512=base64.b64encode(open('icons/icon-512.png','rb').read()).decode()
i192=base64.b64encode(open('icons/icon-192.png','rb').read()).decode()
mf['icons']=[{"src":f"data:image/png;base64,{i192}","sizes":"192x192","type":"image/png","purpose":"any"},
             {"src":f"data:image/png;base64,{i512}","sizes":"512x512","type":"image/png","purpose":"any"}]
mf['start_url']='./'
muri="data:application/manifest+json;base64,"+base64.b64encode(json.dumps(mf).encode()).decode()
out=html
out=out.replace('<link rel="manifest" href="manifest.webmanifest" />',f'<link rel="manifest" href="{muri}" />')
out=out.replace('<link rel="icon" href="icons/icon-192.png" />',f'<link rel="icon" href="data:image/png;base64,{i192}" />')
out=out.replace('<link rel="apple-touch-icon" href="icons/icon-192.png" />',f'<link rel="apple-touch-icon" href="data:image/png;base64,{i192}" />')
out=out.replace('<script src="niimbot.js"></script>', f'<script>\n{niimbot}\n</script>')
out=out.replace('<script type="module" src="app.js"></script>',
                f'<script>\n// ===== render =====\n{render}\n// ===== app =====\n{app}\n</script>')
# Par défaut, écrit à la racine du dépôt : c'est ce que sert GitHub Pages.
dd = sys.argv[1] if len(sys.argv)>1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.makedirs(dd, exist_ok=True)
open(os.path.join(dd,'index.html'),'w',encoding='utf-8').write(out)
open(os.path.join(dd,'sw.js'),'w',encoding='utf-8').write(open('sw.js',encoding='utf-8').read())
print("généré :", len(out))

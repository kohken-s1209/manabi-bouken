/* Knowledge Village v0.7 — genuine WebGL dollhouse. Keeps original save data. */
(function(){
'use strict';
if(!window.THREE){console.warn('3D library unavailable, retaining 2D room');return}
const T=window.THREE;
let renderer=null,scene=null,camera=null,raycaster=new T.Raycaster(),mouse=new T.Vector2(),objects=[],floorPlane=null,dragging=false,down=null,selectedCell=null,anim=0,initialized=false;
const furnitureColors={bed:0xf2a7bf,sofa:0x81b6dc,desk:0xb88657,plant:0x61a975,tv:0x303847,books:0xcda76e,rug:0xae85d3,piano:0x393341};
const textures={wallpink:0xf5cbdc,wallblue:0xb8d9f5,wallgreen:0xc9e7c5,floorwood:0xcfaa78,floortile:0xe7e4df,floorpink:0xefc9df};
function part(w,h,d,color,x,y,z,group){const o=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.86}));o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;group.add(o);return o}
function getDeco(){s.decor=s.decor||{};const d=s.decor[house]||(s.decor[house]={});d.size=d.size||5;d.rot=d.rot||{};d.wall=d.wall||'wallpink';d.floor=d.floor||'floorwood';return d}
function getCells(){return s.rooms[house]||(s.rooms[house]={})}
function buildFurniture(kind,group){
const c=furnitureColors[kind]||0x9e7d56;
if(kind==='bed'){part(.85,.20,1.55,c,0,.35,0,group);part(.85,.46,.12,0xe7eef7,0,.55,-.73,group);part(.7,.08,.4,0xffffff,0,.51,-.42,group)}
else if(kind==='sofa'){part(1.3,.27,.55,c,0,.38,.1,group);part(1.3,.65,.16,c,0,.68,-.25,group);part(.15,.42,.65,c,-.65,.58,0,group);part(.15,.42,.65,c,.65,.58,0,group)}
else if(kind==='desk'){part(1.1,.12,.65,c,0,.75,0,group);for(const x of [-.45,.45])for(const z of [-.23,.23])part(.1,.72,.1,0x86603e,x,.37,z,group)}
else if(kind==='plant'){part(.35,.43,.35,0xc68561,0,.26,0,group);const leaf=new T.Mesh(new T.SphereGeometry(.4,9,7),new T.MeshStandardMaterial({color:0x60a75b}));leaf.position.y=.78;group.add(leaf)}
else if(kind==='tv'){part(1.2,.8,.1,0x313b48,0,.8,0,group);part(1.02,.62,.02,0x77b9e9,0,.82,.06,group);part(.12,.35,.13,0x454545,0,.3,0,group)}
else if(kind==='books'){part(.95,1.4,.32,c,0,.78,0,group);for(let y=.4;y<=1.3;y+=.32)part(.8,.05,.36,0x705034,0,y,0,group)}
else if(kind==='rug'){part(1.55,.05,1.55,c,0,.07,0,group)}
else if(kind==='piano'){part(1.5,.65,.76,0x393341,0,.56,0,group);part(1.4,.05,.22,0xf8f7e9,0,.91,.31,group)}
else part(.9,.7,.8,c,0,.4,0,group);
}
function renderScene(){
if(!scene)return;while(scene.children.length){const o=scene.children[0];scene.remove(o);o.traverse(node=>{node.geometry?.dispose();if(node.material){(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>m.dispose())}})}
objects=[];const d=getDeco(),n=d.size,cells=getCells(),half=n/2;
scene.background=new T.Color(0xc5dcee);
scene.add(new T.HemisphereLight(0xffffff,0x8b785f,1.05));
const light=new T.DirectionalLight(0xffffff,1.2);light.position.set(-4,11,7);scene.add(light);
part(n,.16,n,textures[d.floor]||textures.floorwood,0,-.13,0,scene);
part(n,2.8,.16,textures[d.wall]||textures.wallpink,0,1.3,-half,scene);
part(.16,2.8,n,textures[d.wall]||textures.wallpink,-half,1.3,0,scene);
for(let i=0;i<n*n;i++){const x=(i%n)-half+.5,z=Math.floor(i/n)-half+.5;const pad=part(.96,.025,.96,selectedCell===i?0xffb83f:0x5a453a,x,.002,z,scene);pad.material.transparent=true;pad.material.opacity=selectedCell===i?.52:.095;pad.userData.cell=i;objects.push(pad);const kind=cells[i];if(kind){const group=new T.Group();group.position.set(x,0,z);group.rotation.y=((d.rot[i]||0)*Math.PI/180);buildFurniture(kind,group);scene.add(group);group.traverse(o=>{if(o.isMesh){o.userData.cell=i;objects.push(o)}})}}
}
function pick(evt){const r=renderer.domElement.getBoundingClientRect();mouse.set((evt.clientX-r.left)/r.width*2-1,-(evt.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(mouse,camera);const hits=raycaster.intersectObjects(objects,false);return hits.length?hits[0].object.userData.cell:null}
function selectCell(i){if(i===null){feedback='床か家具をタップしてね！';draw();return}const cells=getCells();if(selectedCell!==null&&selectedCell!==i&&cells[selectedCell]&&!cells[i]){cells[i]=cells[selectedCell];delete cells[selectedCell];const d=getDeco();d.rot[i]=d.rot[selectedCell]||0;delete d.rot[selectedCell];selectedCell=null;save();feedback='✨ 家具を移動したよ！';draw();return}
if(cells[i]){selectedCell=i;feedback='家具を選択中。空いている場所をタップすると移動できるよ！';draw();return}
if(selectedCell!==null){selectedCell=null;feedback='家具の選択を解除したよ';draw();return}
const f=furniture[roomItem];if(!f){return}
if((s.owned[roomItem]||0)>0)s.owned[roomItem]--;else if(s.wood>=f.w&&s.stone>=f.s){s.wood-=f.w;s.stone-=f.s}else{selected={kind:roomItem,missingWood:Math.max(0,f.w-s.wood),missingStone:Math.max(0,f.s-s.stone)};view='study';startQuest();return}
cells[i]=roomItem;save();feedback='✨ 新しい家具を置いたよ！';draw()
}
function mount(){const canvas=document.getElementById('kv3d');if(!canvas||!window.THREE)return;const rect=canvas.getBoundingClientRect();if(rect.width<2)return;
if(renderer){renderer.dispose();renderer=null}cancelAnimationFrame(anim);
try{renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setSize(rect.width,rect.height,false);renderer.outputColorSpace=T.SRGBColorSpace}
catch(e){console.warn('WebGL unavailable',e);document.getElementById('kv3d-wrap').innerHTML='<p>この端末では3D表示が使えません。2D版に戻してください。</p>';return}
scene=new T.Scene();camera=new T.PerspectiveCamera(44,rect.width/rect.height,.1,120);const n=getDeco().size;camera.position.set(n*.94,n*1.4,n*1.55);camera.lookAt(0,.4,0);renderScene();
let azimuth=Math.atan2(camera.position.x,camera.position.z),zoom=camera.position.length();
const updateCam=()=>{camera.position.set(Math.sin(azimuth)*zoom,zoom*.68,Math.cos(azimuth)*zoom);camera.lookAt(0,.5,0)};
canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};dragging=false;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!down)return;const delta=e.clientX-down.x;if(Math.abs(delta)>12||Math.abs(e.clientY-down.y)>12)dragging=true;if(dragging){azimuth+=delta*.008;updateCam();down={x:e.clientX,y:e.clientY}}});
canvas.addEventListener('pointerup',e=>{if(!dragging)selectCell(pick(e));down=null});
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(5,Math.min(24,zoom+Math.sign(e.deltaY)));updateCam()},{passive:false});
canvas.style.touchAction='none';updateCam();function frame(){if(!renderer||document.getElementById('kv3d')!==canvas)return;renderer.render(scene,camera);anim=requestAnimationFrame(frame)}frame()
}
window.kv3dStyle=function(k,v){getDeco()[k]=v;save();draw()};
window.kv3dRotate=function(){if(selectedCell===null||!getCells()[selectedCell])return;const d=getDeco();d.rot[selectedCell]=((d.rot[selectedCell]||0)+90)%360;save();draw()};
window.kv3dStore=function(){if(selectedCell===null)return;const cs=getCells(),kind=cs[selectedCell];if(kind){delete cs[selectedCell];s.owned[kind]=(s.owned[kind]||0)+1}selectedCell=null;save();draw()};
window.kv3dExpand=function(){if(getDeco().size===7)return;kv6expand();};
const oldRoom=room;
room=function(){const houses=Object.keys(s.world).filter(i=>s.world[i]==='house');if(!houses.length)return oldRoom();if(!houses.includes(String(house)))house=Number(houses[0]);const d=getDeco();const style=(field,values)=>values.map(v=>'<button class="tool" onclick="kv3dStyle(\''+field+'\',\''+v[0]+'\')">'+v[1]+'</button>').join('');
return '<div class="twocol"><section class="panel"><h2>🏡 3D おへやづくり</h2><div class="note">① 右の家具ショップで家具を選ぶ → ② 3Dの床をタップして置く。移動は家具をタップ → 空いた床をタップ。視点は指を横へ動かして回転。</div><div id="kv3d-wrap" style="border-radius:18px;overflow:hidden;background:#c5dcee"><canvas id="kv3d" style="display:block;width:100%;height:420px;touch-action:none"></canvas></div><p class="muted">空いた床をタップして家具を置こう。家具→空いた床で移動。指を横に動かして視点を回転！</p><div class="row"><button class="btn" onclick="kv3dRotate()">🔄 家具を回転</button><button class="btn" onclick="kv3dStore()">📦 収納</button></div>'+msg()+'</section><section class="panel"><h2>🎨 おへやのデザイン</h2><p>かべの色</p><div class="tools">'+style('wall',[['wallpink','🌸 ピンク'],['wallblue','💧 ブルー'],['wallgreen','🌿 グリーン']])+'</div><p>ゆか</p><div class="tools">'+style('floor',[['floorwood','🪵 木目'],['floortile','⬜ タイル'],['floorpink','🌷 ピンク']])+'</div><h2>🪑 家具</h2>'+tools(furniture,roomItem,'setRoomItem')+(d.size===5?'<button class="btn" onclick="kv3dExpand()">🏗️ 広げる（木材30・石材18）</button>':'<p>✨ 広いおへや</p>')+'</section></div>'};
const oldDraw=draw;
draw=function(){oldDraw();if(view==='room')requestAnimationFrame(mount);else if(renderer){cancelAnimationFrame(anim);renderer.dispose();renderer=null;scene=null}};
})();

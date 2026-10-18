/* Knowledge Village v0.4 learning engine — no network, no personal data */
(function(global){
'use strict';
const TYPES=[
{id:'join',skill:'REL_JOIN',op:'+',prompt:(a,b,x)=>x+'が '+a+'こ あります。'+b+'こ ふえました。ぜんぶで 何こ？',meaning:['ぜんぶの かず','のこりの かず','ちがい'],mi:0,why:'ふえた ぶんを あわせるから、たし算だね。'},
{id:'remain',skill:'REL_PART',op:'-',prompt:(a,b,x)=>x+'が '+a+'こ あります。'+b+'こ つかいました。のこりは 何こ？',meaning:['つかった かず','のこりの かず','ぜんぶの かず'],mi:1,why:'ぜんぶから つかった ぶんを のぞくよ。'},
{id:'need',skill:'REL_PART',op:'-',prompt:(a,b,x)=>x+'を ぜんぶで '+a+'こ あつめたいです。いま '+b+'こ あります。あと 何こ ひつよう？',meaning:['たりない かず','あつめた かず','ぜんぶの かず'],mi:0,why:'ひつような かずから、いま ある かずを ひくよ。'},
{id:'compare',skill:'REL_COMPARE',op:'-',prompt:(a,b,x)=>'大きい おうちは '+a+'この '+x+'を つかいます。小さい おうちは '+b+'こ です。ちがいは 何こ？',meaning:['2つを あわせた かず','2つの ちがい','小さい おうちの かず'],mi:1,why:'2つの かずの ちがいを しらべるよ。'},
{id:'more',skill:'REL_INVERSE',op:'+',prompt:(a,b,x)=>'赤い へやに '+a+'この '+x+'が あります。青い へやは 赤い へやより '+b+'こ 多いです。青い へやは 何こ？',meaning:['赤い へや','青い へや','2つの へやの ごうけい'],mi:1,why:'青い へやは もっと 多いから、たすよ。'},
{id:'less',skill:'REL_INVERSE',op:'-',prompt:(a,b,x)=>'赤い へやに '+a+'この '+x+'が あります。青い へやは 赤い へやより '+b+'こ 少ないです。青い へやは 何こ？',meaning:['青い へや','赤い へや','2つの へやの ごうけい'],mi:0,why:'青い へやは 少ないので、ひくよ。'},
{id:'totalParts',skill:'REL_PART',op:'+',prompt:(a,b,x)=>'おにわに 赤い '+x+'が '+a+'こ、白い '+x+'が '+b+'こ あります。あわせて 何こ？',meaning:['あわせた かず','赤い かずだけ','ちがい'],mi:0,why:'赤と白を あわせるよ。'},
{id:'sold',skill:'REL_PART',op:'-',prompt:(a,b,x)=>'おみせに '+x+'が '+a+'こ ありました。のこりは '+b+'こ です。うれたのは 何こ？',meaning:['のこりの かず','うれた かず','ぜんぶの かず'],mi:1,why:'はじめの かずから、のこった かずを ひくよ。'},
{id:'difference',skill:'REL_COMPARE',op:'-',prompt:(a,b,x)=>x+'が '+a+'こ の はこ と、'+b+'こ の はこ。多い はこは 何こ 多い？',meaning:['ちがい','ごうけい','少ない はこ'],mi:0,why:'何こ 多いかは、2つの ちがいだよ。'},
{id:'increaseGoal',skill:'REL_JOIN',op:'+',prompt:(a,b,x)=>'きのう '+x+'を '+a+'こ つくりました。きょう '+b+'こ つくりました。2日で 何こ？',meaning:['きょうの かず','2日で つくった かず','のこり'],mi:1,why:'2日分を あわせよう。'}
];
const OBJECTS=['ブロック','花','まど','タイル','レンガ','ランプ','いた','いす','木の いた','かざり'];
function hash(str){let n=2166136261;for(let i=0;i<str.length;i++){n=Math.imul(n^str.charCodeAt(i),16777619)}return n>>>0}
function generate({level=2,ordinal=0,history=[]}={}){
 level=Math.max(1,Math.min(3,Number(level)||2));let recent=new Set((history||[]).slice(-8).map(x=>x.template));
 let pool=TYPES.map((t,i)=>({t,i})).filter(x=>!recent.has(x.t.id));if(!pool.length)pool=TYPES.map((t,i)=>({t,i}));
 const idx=(ordinal*7+level*13)%pool.length;const {t}=pool[idx];
 const seed=hash(t.id+':'+level+':'+ordinal);let a,b;
 if(level===1){a=12+seed%36;b=2+Math.floor(seed/19)%10}
 else if(level===2){a=40+seed%90;b=12+Math.floor(seed/23)%39}
 else{a=105+seed%280;b=26+Math.floor(seed/31)%89}
 if(t.op==='-'&&b>=a)b=Math.max(1,a-7);
 const object=OBJECTS[Math.floor(seed/113)%OBJECTS.length];
 return {id:t.id+'-'+level+'-'+ordinal,template:t.id,skill:t.skill,a,b,op:t.op,type:t.op==='+'?'more':t.id==='compare'||t.id==='difference'?'gap':'left',q:t.prompt(a,b,object),meaning:t.meaning,mi:t.mi,why:t.why,level,answer:t.op==='+'?a+b:a-b};
}
function record(history,event){return [...(history||[]),event].slice(-1000)}
function stats(history){
 const map={};for(const h of history||[]){if(!h.skill)continue;let v=map[h.skill]||(map[h.skill]={skill:h.skill,count:0,firstNoHint:0,hints:0,wrong:0,times:[],unique:new Set(),dates:new Set()});
 v.count++;v.unique.add(h.id||h.template);v.dates.add(String(h.at||'').slice(0,10));v.hints+=(h.hint||0);v.wrong+=(h.mistakes||0);if(!h.hint&&!h.mistakes)v.firstNoHint++;if(Number.isFinite(h.activeSec))v.times.push(h.activeSec)}
 return Object.values(map).map(v=>{let ts=v.times.slice().sort((a,b)=>a-b);const unique=v.unique.size;return {skill:v.skill,count:v.count,unique,accuracy:Math.round(100*v.firstNoHint/Math.max(1,v.count)),medianSec:ts.length?Math.round(ts[Math.floor(ts.length/2)]):null,mastery:unique<5?null:Math.round(100*(v.firstNoHint/Math.max(1,v.count))*(v.dates.size>1?1:.85)),confidence:unique<5?'判定中':unique<12?'暫定':'参考値',hints:v.hints,wrong:v.wrong}});
}
function reward(level,seconds,hints,wrong){const bases=[0,6,10,15],targets=[0,45,75,120],target=targets[level]||75;let extra=seconds<=target*.65?5:seconds<=target?3:seconds<=target*1.5?1:0;return {base:bases[level],speed:extra,total:Math.max(2,bases[level]+extra-hints*3-wrong*2)}}
global.KVEngine={generate,record,stats,reward,TYPES};
})(window);
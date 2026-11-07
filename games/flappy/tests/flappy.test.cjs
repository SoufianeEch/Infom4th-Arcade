const test = require('node:test');
const assert = require('node:assert/strict');
const { FlappyEngine, circleIntersectsRect } = require('../engine.js');
function random(seed = 19) { return () => { seed=(seed*1664525+1013904223)>>>0;return seed/4294967296; }; }
function advance(game, seconds, hz = 120) { for(let i=0;i<seconds*hz;i++)game.update(1/hz); }
function fixture() { const e=new FlappyEngine({random:random()});e.start();return e; }
function pilot(e) {
  const next=e.pipes.find(pipe=>!pipe.passed);
  const target=next?.center??(e.floor+e.ceiling)/2;
  if(e.bird.y>target+6&&e.bird.vy > -100)e.flap();
}
test('ready remains still and start immediately flaps with a fair first-gate lead-in',()=>{
  const e=new FlappyEngine();advance(e,4);assert.equal(e.state,'ready');assert.equal(e.distance,0);
  e.start();assert.equal(e.flaps,1);assert.equal(e.bird.vy,-310);
  assert.ok((e.pipes[0].x-e.birdX)/e.speed>=2.3);assert.equal(e.score,0);
});
test('a flap replaces downward velocity and has a brief duplicate-input debounce',()=>{
  const e=fixture();e.update(.05);assert.equal(e.flap(),false);
  e.update(.05);e.bird.vy=250;assert.equal(e.flap(),true);assert.equal(e.bird.vy,-310);
  assert.equal(e.flap(),false);
});
test('gravity makes unattended flight end at the ground exactly once',()=>{
  const events=[],e=new FlappyEngine({onEvent:(event,detail)=>events.push({event,detail})});e.start();advance(e,4);
  assert.equal(e.state,'over');const crashes=events.filter(x=>x.event==='crash');
  assert.equal(crashes.length,1);assert.equal(crashes[0].detail.reason,'ground');
  const score=e.score;advance(e,3);assert.equal(e.score,score);
});
test('ceiling and either solid gate segment cause a collision',()=>{
  const ceiling=fixture();ceiling.bird.y=ceiling.ceiling+ceiling.radius-1;ceiling.update(1/120);assert.equal(ceiling.state,'over');
  for(const side of['top','bottom']){
    const e=fixture(),pipe=e.pipes[0];pipe.x=e.birdX-20;
    e.bird.y=side==='top'?pipe.center-pipe.gap/2-8:pipe.center+pipe.gap/2+8;
    e.bird.vy=0;e.update(1/120);assert.equal(e.state,'over',side);
  }
});
test('flying through a gap does not collide with the gate or award early points',()=>{
  const e=fixture(),pipe=e.pipes[0];pipe.x=e.birdX-15;e.bird.y=pipe.center;e.bird.vy=0;
  e.update(1/120);assert.equal(e.state,'running');assert.equal(e.score,0);
});
test('a cleared gate scores once and a centred exit counts as a perfect gap',()=>{
  const e=fixture(),pipe=e.pipes[0];pipe.x=e.birdX-e.radius-pipe.w+1;e.bird.y=pipe.center;e.bird.vy=0;
  e.update(.02);assert.equal(e.score,1);assert.equal(e.perfects,1);assert.equal(e.streak,1);
  e.update(.02);assert.equal(e.score,1);assert.equal(e.perfects,1);
});
test('off-centre valid exits reset precision streak without losing the gate score',()=>{
  const e=fixture(),pipe=e.pipes[0];e.streak=3;pipe.x=e.birdX-e.radius-pipe.w+1;e.bird.y=pipe.center+42;e.bird.vy=0;
  e.update(.02);assert.equal(e.state,'running');assert.equal(e.score,1);assert.equal(e.streak,0);
});
test('pause freezes flight, gates and score; resume preserves the same trajectory',()=>{
  const e=fixture();advance(e,.15);e.pause();const before=JSON.stringify({bird:e.bird,pipes:e.pipes,elapsed:e.elapsed,score:e.score});
  advance(e,10);assert.equal(JSON.stringify({bird:e.bird,pipes:e.pipes,elapsed:e.elapsed,score:e.score}),before);
  e.resume();e.update(.02);assert.ok(e.elapsed>JSON.parse(before).elapsed);
});
test('short restart guard prevents an accidental crash tap from instantly starting again',()=>{
  const e=fixture();e.die('gate');assert.equal(e.canRestart,false);advance(e,.4);assert.equal(e.canRestart,true);
  e.start();assert.equal(e.score,0);assert.equal(e.perfects,0);assert.equal(e.flaps,1);assert.equal(e.state,'running');
});
test('seeded generation is deterministic and keeps gaps inside safe limits',()=>{
  const a=new FlappyEngine({random:random(12)}),b=new FlappyEngine({random:random(12)});a.start();b.start();assert.deepEqual(a.pipes,b.pipes);
  let previous=a.lastGapCenter;
  for(let i=0;i<100;i++){
    a.score=i;const pipe=a.spawnPipe(1000+i*270);
    assert.ok(pipe.center-pipe.gap/2>=a.ceiling+35.9);
    assert.ok(pipe.center+pipe.gap/2<=a.floor-35.9);
    assert.ok(Math.abs(pipe.center-previous)<=60.001);previous=pipe.center;
  }
});
test('difficulty ramps with score but has bounded speed, spacing and minimum gap',()=>{
  const e=fixture(),startGap=e.gapSize,startSpeed=e.speed;e.score=20;
  assert.ok(e.gapSize<startGap);assert.ok(e.speed>startSpeed);
  e.score=100000;assert.equal(e.gapSize,144);assert.equal(e.speed,235);assert.equal(e.spacing,250);
});
test('resizing preserves time to each gate and keeps the bird in the field',()=>{
  const e=fixture(),before=e.pipes.map(pipe=>(pipe.x-e.birdX)/e.speed);
  e.resize(320,480);e.pipes.forEach((pipe,i)=>assert.ok(Math.abs((pipe.x-e.birdX)/e.speed-before[i])<.0001));
  assert.ok(e.bird.y>e.ceiling+e.radius);assert.ok(e.bird.y<e.floor-e.radius);
  e.resize(1100,400);assert.ok(e.pipes.every(pipe=>pipe.center+pipe.gap/2<e.floor));
});
test('stalled or invalid frames cannot teleport the bird across the field',()=>{
  const e=fixture(),elapsed=e.elapsed;e.update(100);assert.ok(e.elapsed-elapsed<=.051);
  const y=e.bird.y;e.update(NaN);e.update(-1);assert.equal(e.bird.y,y);
});
test('circular hitbox allows near-corner misses and detects real overlap',()=>{
  const rect={x:10,y:10,w:20,h:20};
  assert.equal(circleIntersectsRect({x:5,y:5,r:6},rect),false);
  assert.equal(circleIntersectsRect({x:8,y:15,r:4},rect),true);
  assert.equal(circleIntersectsRect({x:5,y:15,r:5},rect),false);
});
test('sustained seeded flights remain navigable at phone/desktop widths and multiple frame rates',()=>{
  for(const width of[320,420,1100])for(const hz of[30,60,120])for(const seed of[1,9,61]){
    const e=new FlappyEngine({width,random:random(seed)});e.start();
    for(let tick=0;tick<hz*120&&e.state==='running';tick++){pilot(e);e.update(1/hz);}
    assert.equal(e.state,'running','width='+width+' hz='+hz+' seed='+seed+' score='+e.score);
    assert.ok(e.score>60);assert.ok(e.pipes.length<12);
  }
});
test('every gate carries a coin in its gap, collected once when the bird flies through it',()=>{
  const events=[],e=new FlappyEngine({random:random(),onEvent:(event,detail)=>events.push({event,detail})});e.start();
  const pipe=e.pipes[0],coin=e.coins.find(c=>c.pipe===pipe);assert.ok(coin);assert.equal(coin.y,pipe.center);
  pipe.x=e.birdX-pipe.w/2;coin.x=e.birdX;e.bird.y=pipe.center;e.bird.vy=0;e.update(1/120);
  assert.equal(e.coinCount,1);assert.equal(events.filter(x=>x.event==='coin').length,1);
  e.update(1/120);assert.equal(e.coinCount,1);assert.ok(!e.coins.includes(coin));
});
test('every tenth gate is a gem worth five and every third gate adds a coin trail',()=>{
  const e=fixture();
  for(let i=0;i<12;i++)e.spawnPipe(e.pipes.at(-1).x+e.spacing);
  const gems=e.coins.filter(c=>c.gem);assert.ok(gems.length>=1);assert.ok(gems.every(c=>c.value===5&&c.pipe.index%10===0));
  const trail=e.coins.filter(c=>!c.pipe);assert.ok(trail.length>=3);
  assert.ok(trail.every(c=>c.y>e.ceiling&&c.y<e.floor));
});
test('a crash can be revived exactly once, clearing the gate ahead and keeping the score',()=>{
  const e=fixture();e.score=7;e.pipes[0].x=e.birdX;e.die('gate');
  assert.equal(e.revive(),true);assert.equal(e.state,'running');assert.equal(e.score,7);
  const next=e.pipes.find(p=>!p.passed);assert.ok(next.x>=e.birdX+e.speed*1.5);assert.equal(e.bird.y,next.center);
  e.die('ground');assert.equal(e.revive(),false);assert.equal(e.state,'over');
  e.start();assert.equal(e.revived,false);assert.equal(e.coinCount,0);
});

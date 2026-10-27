/* ==========================================================================
   Cement line — Three.js scene
   Ball mill → packer → belt → the bag bursts back into its raw materials.
   Exposes window.CementScene.create(THREE, canvas, opts); main.js drives it
   with a scroll-derived state every frame.
   ========================================================================== */
(function () {
  'use strict';

  const NAVY = '#13306b';
  const RED = '#c8312b';
  const BG = '#c5c0b8';
  const HALF_PI = Math.PI / 2;

  const BAG = { w: 1.0, h: 1.3, d: 0.5 };
  const STAGE = { x: 23, z: 0 };
  const PACKER = { x: 7.6, spoutY: 2.52 };
  const BELT = { x0: 6.6, x1: 13.6, y: 0.945 };

  // Stage 1 — what's in the bag: clinker, gypsum, additives.
  // Stage 2 — what the clinker was made from: limestone, clay, sand, iron ore.
  // Pile sizes are visual; minor materials are boosted so every pile stays readable.
  const PILE = {
    clinker: { r: 2.3, h: 1.8, x: STAGE.x, z: -0.6 },
    gypsum: { r: 1.0, h: 0.8, x: STAGE.x + 3.6, z: 2.6 },
    additives: { r: 1.05, h: 0.85, x: STAGE.x - 3.6, z: 2.6 },
    limestone: { r: 2.1, h: 1.7, x: STAGE.x, z: -2.0 },
    clay: { r: 1.3, h: 1.0, x: STAGE.x - 3.4, z: -0.6 },
    sand: { r: 1.2, h: 0.95, x: STAGE.x + 3.4, z: -0.6 },
    iron: { r: 0.9, h: 0.72, x: STAGE.x, z: 1.25 },
  };
  const CLINKER = ['#4b4945', '#2b2a28'];
  // two colours blend per particle; more than two speckle (slag, pozzolana, fly ash, limestone filler)
  const GROUPS = [
    { share: 0.40, mid: 'clinker', end: 'limestone', midColors: CLINKER, colors: ['#dcd4c3', '#b8ad98'] },
    { share: 0.15, mid: 'clinker', end: 'clay', midColors: CLINKER, colors: ['#b5653f', '#844427'] },
    { share: 0.11, mid: 'clinker', end: 'sand', midColors: CLINKER, colors: ['#dfba6e', '#bb9246'] },
    { share: 0.09, mid: 'clinker', end: 'iron', midColors: CLINKER, colors: ['#5d3126', '#2c211e'] },
    { share: 0.11, mid: 'gypsum', end: 'gypsum', colors: ['#f6f3ee', '#d4cfc5'] },
    { share: 0.14, mid: 'additives', end: 'additives', colors: ['#8e9387', '#a9806a', '#a5a29b', '#cdc5b3'] },
  ];
  // label anchors — same order as MATERIALS in main.js
  const LABEL_PILES = ['clinker', 'gypsum', 'additives', 'limestone', 'clay', 'sand', 'iron'];

  /* ---------- bag shape: unit box coords → pillow-shaped valve bag ---------- */
  function bagShape(nx, ny, nz, out) {
    const ax = Math.abs(nx), ay = Math.abs(ny);
    const puff = Math.pow(Math.max(0, 1 - ax * ax), 0.42) * Math.pow(Math.max(0, 1 - Math.pow(ay, 6)), 0.5);
    out[0] = nx * BAG.w * 0.5 * (1 - 0.05 * ny * ny);
    out[1] = ny * BAG.h * 0.5 * (1 - 0.03 * nx * nx);
    out[2] = nz * BAG.d * 0.5 * (0.12 + 0.88 * puff) + nz * 0.006 * Math.sin(nx * 11 + ny * 5) * puff;
    return out;
  }

  /* ---------- canvas helpers ---------- */
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fitText(ctx, text, x, y, maxW) {
    const w = ctx.measureText(text).width;
    if (w <= maxW) { ctx.fillText(text, x, y); return; }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(maxW / w, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function spaced(ctx, px) {
    if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px';
  }

  function weave(ctx, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = '#000';
    for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 2);
    for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 2, h);
    ctx.restore();
  }

  function stamp(ctx, cx, cy, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.86;
    ctx.strokeStyle = RED;
    ctx.fillStyle = RED;
    ctx.lineWidth = 8;
    roundRect(ctx, -175, -100, 350, 200, 18); ctx.stroke();
    ctx.lineWidth = 3;
    roundRect(ctx, -160, -85, 320, 170, 12); ctx.stroke();
    ctx.textAlign = 'center';
    spaced(ctx, 2);
    ctx.font = '66px Anton, Impact, sans-serif';
    ctx.fillText('QC PASSED', 0, -6);
    spaced(ctx, 1);
    ctx.font = '600 26px "JetBrains Mono", monospace';
    ctx.fillText('I. M. EL-BADRY', 0, 38);
    ctx.font = '500 20px "JetBrains Mono", monospace';
    ctx.fillText('XRF · XRD · PHYS', 0, 68);
    ctx.restore();
  }

  function drawFront(ctx, W, H) {
    ctx.fillStyle = '#f2efe9';
    ctx.fillRect(0, 0, W, H);
    weave(ctx, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // head band + wordmark
    ctx.fillStyle = NAVY;
    ctx.fillRect(0, 0, W, 330);
    ctx.fillStyle = '#fff';
    spaced(ctx, 22);
    ctx.font = '210px Anton, Impact, sans-serif';
    fitText(ctx, 'TITAN', W / 2 + 11, 250, W - 160);
    spaced(ctx, 10);
    ctx.font = '600 32px "Inter Tight", Arial, sans-serif';
    fitText(ctx, 'CEMENT GROUP · EGYPT', W / 2 + 5, 302, W - 200);

    // plant band
    ctx.fillStyle = RED;
    ctx.fillRect(0, 330, W, 92);
    ctx.fillStyle = '#fff';
    spaced(ctx, 4);
    ctx.font = '700 40px "Inter Tight", Arial, sans-serif';
    fitText(ctx, 'ALEXANDRIA PORTLAND CEMENT CO.', W / 2, 391, W - 90);

    // product
    ctx.fillStyle = NAVY;
    spaced(ctx, 4);
    ctx.font = '176px Anton, Impact, sans-serif';
    fitText(ctx, 'PORTLAND', W / 2, 650, W - 120);
    fitText(ctx, 'CEMENT', W / 2, 828, W - 120);

    roundRect(ctx, W / 2 - 235, 872, 470, 98, 49);
    ctx.fillStyle = RED;
    ctx.fill();
    ctx.fillStyle = '#fff';
    spaced(ctx, 2);
    ctx.font = '700 56px "Inter Tight", Arial, sans-serif';
    fitText(ctx, 'CEM I 42.5 N', W / 2, 941, 420);

    ctx.fillStyle = '#3d3b37';
    spaced(ctx, 2);
    ctx.font = '500 28px "JetBrains Mono", monospace';
    fitText(ctx, 'ES 4756-1  ·  EN 197-1', W / 2, 1022, W - 200);

    // 50 kg badge
    ctx.beginPath();
    ctx.arc(W - 190, H - 250, 112, 0, Math.PI * 2);
    ctx.fillStyle = NAVY;
    ctx.fill();
    ctx.fillStyle = '#fff';
    spaced(ctx, 0);
    ctx.font = '104px Anton, Impact, sans-serif';
    ctx.fillText('50', W - 190, H - 236);
    ctx.font = '700 34px "Inter Tight", Arial, sans-serif';
    ctx.fillText('KG', W - 190, H - 186);

    stamp(ctx, 235, H - 250, -0.14);

    ctx.fillStyle = NAVY;
    ctx.fillRect(0, H - 64, W, 64);
  }

  function drawBack(ctx, W, H) {
    ctx.fillStyle = '#f2efe9';
    ctx.fillRect(0, 0, W, H);
    weave(ctx, W, H);
    ctx.textAlign = 'center';

    ctx.fillStyle = NAVY;
    ctx.fillRect(0, 0, W, 480);
    ctx.fillStyle = '#fff';
    spaced(ctx, 6);
    ctx.font = '150px Anton, Impact, sans-serif';
    fitText(ctx, 'QUALITY', W / 2, 220, W - 140);
    fitText(ctx, 'CONTROLLED', W / 2, 380, W - 140);
    ctx.fillStyle = RED;
    ctx.fillRect(0, 480, W, 26);

    // test certificate
    const rows = [
      ['FINENESS (BLAINE)', 'PASS'],
      ['SETTING TIME', 'PASS'],
      ['COMPRESSIVE STRENGTH', 'PASS'],
      ['SO3  ·  LOI  ·  INSOLUBLE', 'PASS'],
      ['XRF CHEMISTRY', 'PASS'],
      ['XRD MINERALOGY', 'PASS'],
    ];
    ctx.textAlign = 'left';
    spaced(ctx, 1);
    rows.forEach((r, i) => {
      const y = 610 + i * 92;
      ctx.fillStyle = '#2b2a27';
      ctx.font = '600 34px "JetBrains Mono", monospace';
      ctx.fillText(r[0], 90, y);
      ctx.fillStyle = RED;
      ctx.textAlign = 'right';
      ctx.fillText('✓ ' + r[1], W - 90, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(90, y + 28, W - 180, 2);
    });

    ctx.fillStyle = NAVY;
    ctx.font = '600 30px "Inter Tight", Arial, sans-serif';
    ctx.textAlign = 'center';
    fitText(ctx, 'Inspected by Ibrahem Mohammed El-Badry', W / 2, 1150, W - 160);
    ctx.font = '500 26px "JetBrains Mono", monospace';
    ctx.fillStyle = '#5a5751';
    fitText(ctx, 'QUALITY ENGINEER · BATCH APCC-QC-26', W / 2, 1196, W - 160);

    ctx.fillStyle = NAVY;
    ctx.fillRect(0, H - 64, W, 64);
  }

  function create(THREE, canvas, opts) {
    opts = opts || {};
    const mobile = !!opts.mobile;

    /* ---------- renderer / camera ---------- */
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const FOG_NEAR = 22, FOG_FAR = 62;
    scene.fog = new THREE.Fog(BG, FOG_NEAR, FOG_FAR);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 140);
    const lookAt = new THREE.Vector3();
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    /* ---------- lights ---------- */
    scene.add(new THREE.HemisphereLight('#ffffff', '#8d877d', 1.25));
    const sun = new THREE.DirectionalLight('#fff4e4', 2.3);
    sun.position.set(16, 18, 12);
    sun.target.position.set(11, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 12, bottom: -12, near: 1, far: 70 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    /* ---------- materials ---------- */
    const m = {
      shell: new THREE.MeshStandardMaterial({ color: '#6b7480', metalness: 0.55, roughness: 0.42 }),
      shellDark: new THREE.MeshStandardMaterial({ color: '#4c535c', metalness: 0.5, roughness: 0.5 }),
      steel: new THREE.MeshStandardMaterial({ color: '#9aa1a8', metalness: 0.8, roughness: 0.3 }),
      steelDark: new THREE.MeshStandardMaterial({ color: '#33373c', metalness: 0.6, roughness: 0.5 }),
      gear: new THREE.MeshStandardMaterial({ color: '#2a2d31', metalness: 0.85, roughness: 0.35 }),
      concrete: new THREE.MeshStandardMaterial({ color: '#bdb7ad', roughness: 0.95 }),
      accent: new THREE.MeshStandardMaterial({ color: '#e2541f', metalness: 0.2, roughness: 0.5 }),
      yellow: new THREE.MeshStandardMaterial({ color: '#e0a526', metalness: 0.2, roughness: 0.55 }),
    };

    function add(parent, geo, mat, x, y, z, rx, ry, rz) {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(x || 0, y || 0, z || 0);
      o.rotation.set(rx || 0, ry || 0, rz || 0);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    }

    function canvasTexture(c, srgb) {
      const t = new THREE.CanvasTexture(c);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      return t;
    }

    function radialTexture() {
      const c = makeCanvas(256, 256), ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.5, '#9a9a9a');
      g.addColorStop(1, '#000');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      return canvasTexture(c, false);
    }

    const radial = radialTexture();

    /* ---------- floor ---------- */
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(84, 36),
      new THREE.MeshStandardMaterial({ color: '#b3ada4', roughness: 1, transparent: true, alphaMap: radial, depthWrite: false })
    );
    floor.rotation.x = -HALF_PI;
    floor.position.set(11, 0, -2);
    floor.receiveShadow = true;
    scene.add(floor);

    /* ---------- ball mill ---------- */
    const mill = new THREE.Group();
    mill.position.set(0, 3.0, -1.6);
    const millRot = new THREE.Group();
    mill.add(millRot);
    const R = 1.55, L = 8, GX = -2.4;

    add(millRot, new THREE.CylinderGeometry(R, R, L, 72, 1, true), m.shell, 0, 0, 0, 0, 0, HALF_PI);
    add(millRot, new THREE.CylinderGeometry(0.62, R, 0.75, 72), m.shell, L / 2 + 0.375, 0, 0, 0, 0, -HALF_PI);
    add(millRot, new THREE.CylinderGeometry(0.62, R, 0.75, 72), m.shell, -(L / 2 + 0.375), 0, 0, 0, 0, HALF_PI);
    add(millRot, new THREE.CylinderGeometry(0.5, 0.5, 1.0, 40), m.steel, L / 2 + 1.2, 0, 0, 0, 0, HALF_PI);
    add(millRot, new THREE.CylinderGeometry(0.5, 0.5, 1.0, 40), m.steel, -(L / 2 + 1.2), 0, 0, 0, 0, HALF_PI);
    [-L / 2 + 0.06, L / 2 - 0.06, -0.9, 0.9].forEach((x) =>
      add(millRot, new THREE.TorusGeometry(R + 0.015, 0.06, 10, 96), m.steel, x, 0, 0, 0, HALF_PI, 0));
    add(millRot, new THREE.CylinderGeometry(R + 0.01, R + 0.01, 0.55, 72, 1, true), m.accent, 2.4, 0, 0, 0, 0, HALF_PI);

    const dummy = new THREE.Object3D();
    const rows = 12, cols = 16;
    const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 6), m.steel, rows * cols);
    let bi = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = (r / rows) * Math.PI * 2 + (c % 2) * 0.13;
        dummy.position.set(-L / 2 + 0.45 + c * (L - 0.9) / (cols - 1), Math.cos(a) * (R + 0.02), Math.sin(a) * (R + 0.02));
        dummy.rotation.set(a, 0, 0);
        dummy.updateMatrix();
        bolts.setMatrixAt(bi++, dummy.matrix);
      }
    }
    millRot.add(bolts);

    [0.5, 0.5 + Math.PI].forEach((a, i) =>
      add(millRot, new THREE.BoxGeometry(0.9, 0.07, 0.62), m.steelDark, i ? -1.5 : 0.6, Math.cos(a) * (R + 0.03), Math.sin(a) * (R + 0.03), a, 0, 0));

    add(millRot, new THREE.CylinderGeometry(2.0, 2.0, 0.3, 96), m.gear, GX, 0, 0, 0, 0, HALF_PI);
    const TEETH = 120;
    const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.14, 0.085), m.gear, TEETH);
    for (let i = 0; i < TEETH; i++) {
      const a = (i / TEETH) * Math.PI * 2;
      dummy.position.set(GX, Math.cos(a) * 2.06, Math.sin(a) * 2.06);
      dummy.rotation.set(a, 0, 0);
      dummy.updateMatrix();
      teeth.setMatrixAt(i, dummy.matrix);
    }
    teeth.castShadow = true;
    millRot.add(teeth);

    // static: piers, bearings, drive train, feed hopper, discharge hood
    [-1, 1].forEach((s) => {
      add(mill, new THREE.BoxGeometry(1.5, 2.3, 2.0), m.concrete, s * (L / 2 + 1.2), -1.85, 0);
      add(mill, new THREE.BoxGeometry(1.0, 0.4, 1.25), m.steelDark, s * (L / 2 + 1.2), -0.6, 0);
    });
    const PY = -1.66, PZ = 1.66;
    const pinion = add(mill, new THREE.CylinderGeometry(0.3, 0.3, 0.32, 24), m.gear, GX, PY, PZ, 0, 0, HALF_PI);
    add(mill, new THREE.CylinderGeometry(0.08, 0.08, 1.8, 12), m.steel, GX - 0.9, PY, PZ, 0, 0, HALF_PI);
    add(mill, new THREE.BoxGeometry(1.0, 0.9, 1.0), m.yellow, GX - 2.1, PY, PZ);
    add(mill, new THREE.CylinderGeometry(0.42, 0.42, 1.2, 32), m.accent, GX - 3.3, PY, PZ, 0, 0, HALF_PI);
    add(mill, new THREE.BoxGeometry(4.2, 0.89, 1.3), m.concrete, GX - 1.9, -2.555, PZ);

    add(mill, new THREE.ConeGeometry(0.75, 1.1, 32, 1, true), m.steel, -(L / 2 + 2.0), 1.05, 0, Math.PI, 0, 0);
    add(mill, new THREE.CylinderGeometry(0.75, 0.75, 0.6, 32), m.steel, -(L / 2 + 2.0), 1.9, 0);
    add(mill, new THREE.CylinderGeometry(0.13, 0.13, 0.9, 12), m.steel, -(L / 2 + 1.8), 0.2, 0, 0, 0, -0.7);
    [-0.6, 0.6].forEach((z) => add(mill, new THREE.BoxGeometry(0.1, 4.6, 0.1), m.yellow, -(L / 2 + 2.0), -0.7, z));

    add(mill, new THREE.BoxGeometry(0.9, 3.9, 1.5), m.shellDark, L / 2 + 1.95, -1.05, 0);
    scene.add(mill);

    /* ---------- packer + air slide ---------- */
    const packer = new THREE.Group();
    const PX = PACKER.x;
    add(packer, new THREE.CylinderGeometry(0.78, 0.78, 1.3, 40), m.shell, PX, 4.75, 0);
    add(packer, new THREE.CylinderGeometry(0.84, 0.84, 0.08, 40), m.steelDark, PX, 5.42, 0);
    add(packer, new THREE.ConeGeometry(0.78, 0.9, 40, 1, true), m.shell, PX, 3.65, 0, Math.PI, 0, 0);
    add(packer, new THREE.CylinderGeometry(0.09, 0.09, 0.7, 16), m.steel, PX, 2.9, 0);
    add(packer, new THREE.CylinderGeometry(0.16, 0.12, 0.12, 16), m.steelDark, PX, PACKER.spoutY + 0.06, 0);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
      add(packer, new THREE.BoxGeometry(0.09, 4.1, 0.09), m.yellow, PX + sx * 0.9, 2.05, sz * 0.9));
    [-0.9, 0.9].forEach((z) => add(packer, new THREE.BoxGeometry(1.9, 0.08, 0.08), m.yellow, PX, 4.12, z));
    [-0.9, 0.9].forEach((x) => add(packer, new THREE.BoxGeometry(0.08, 0.08, 1.9), m.yellow, PX + x, 4.12, 0));
    const slide = new THREE.CatmullRomCurve3([
      new THREE.Vector3(5.95, 3.85, -1.6),
      new THREE.Vector3(6.2, 5.0, -1.3),
      new THREE.Vector3(6.9, 5.75, -0.5),
      new THREE.Vector3(PX, 5.5, 0),
    ]);
    add(packer, new THREE.TubeGeometry(slide, 48, 0.16, 14, false), m.steel);
    scene.add(packer);

    /* ---------- belt conveyor ---------- */
    const beltCanvas = makeCanvas(256, 64);
    {
      const ctx = beltCanvas.getContext('2d');
      ctx.fillStyle = '#2b2b2c';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#3d3d3f';
      for (let x = 0; x < 256; x += 32) ctx.fillRect(x, 0, 9, 64);
    }
    const beltTex = canvasTexture(beltCanvas, true);
    beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
    const BELT_LEN = BELT.x1 - BELT.x0, BELT_CX = (BELT.x0 + BELT.x1) / 2;
    beltTex.repeat.set(BELT_LEN / 0.7, 1);
    const belt = new THREE.Group();
    add(belt, new THREE.BoxGeometry(BELT_LEN, 0.2, 1.45), m.steelDark, BELT_CX, 0.83, 0);
    const beltTop = new THREE.Mesh(new THREE.PlaneGeometry(BELT_LEN, 1.3), new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.95 }));
    beltTop.rotation.x = -HALF_PI;
    beltTop.position.set(BELT_CX, BELT.y, 0);
    beltTop.receiveShadow = true;
    belt.add(beltTop);
    [BELT.x0, BELT.x1].forEach((x) => add(belt, new THREE.CylinderGeometry(0.13, 0.13, 1.45, 20), m.steel, x, 0.83, 0, HALF_PI, 0, 0));
    [-0.76, 0.76].forEach((z) => add(belt, new THREE.BoxGeometry(BELT_LEN, 0.1, 0.06), m.yellow, BELT_CX, 1.0, z));
    for (let x = BELT.x0 + 0.3; x <= BELT.x1 - 0.2; x += 1.6) {
      [-0.6, 0.6].forEach((z) => add(belt, new THREE.BoxGeometry(0.1, 0.74, 0.1), m.steelDark, x, 0.37, z));
    }
    scene.add(belt);

    /* ---------- the bag ---------- */
    const bagGeo = new THREE.BoxGeometry(BAG.w, BAG.h, BAG.d, 28, 34, 6);
    {
      const pos = bagGeo.attributes.position, v = [0, 0, 0];
      for (let i = 0; i < pos.count; i++) {
        bagShape(pos.getX(i) / (BAG.w / 2), pos.getY(i) / (BAG.h / 2), pos.getZ(i) / (BAG.d / 2), v);
        pos.setXYZ(i, v[0], v[1], v[2]);
      }
      bagGeo.computeVertexNormals();
    }
    function labelTexture(draw) {
      const c = makeCanvas(1024, 1332);
      draw(c.getContext('2d'), c.width, c.height);
      return canvasTexture(c, true);
    }
    const bagSide = new THREE.MeshStandardMaterial({ color: '#ebe7e0', roughness: 0.9, transparent: true });
    const bagFront = new THREE.MeshStandardMaterial({ map: labelTexture(drawFront), roughness: 0.8, transparent: true });
    const bagBack = new THREE.MeshStandardMaterial({ map: labelTexture(drawBack), roughness: 0.8, transparent: true });
    const bagMats = [bagSide, bagFront, bagBack];
    const bag = new THREE.Mesh(bagGeo, [bagSide, bagSide, bagSide, bagSide, bagFront, bagBack]);
    bag.castShadow = true;
    scene.add(bag);

    /* ---------- powder stream from the spout ---------- */
    const STREAM = 260;
    const streamGeo = new THREE.BufferGeometry();
    const streamPos = new Float32Array(STREAM * 3);
    const streamSeed = new Float32Array(STREAM * 2);
    for (let i = 0; i < STREAM; i++) { streamSeed[i * 2] = Math.random(); streamSeed[i * 2 + 1] = Math.random(); }
    streamGeo.setAttribute('position', new THREE.BufferAttribute(streamPos, 3));
    const streamPts = new THREE.Points(streamGeo, new THREE.PointsMaterial({ color: '#8f8a83', size: 0.035, transparent: true, opacity: 0, depthWrite: false }));
    streamPts.frustumCulled = false;
    scene.add(streamPts);

    /* ---------- floating dust ---------- */
    const DUST = mobile ? 260 : 520;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] = -10 + Math.random() * 44;
      dustPos[i * 3 + 1] = Math.random() * 8;
      dustPos[i * 3 + 2] = -7 + Math.random() * 14;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.045, transparent: true, opacity: 0.55, depthWrite: false }));
    dust.frustumCulled = false;
    scene.add(dust);

    /* ---------- stage: sampling rings + contact shadows ---------- */
    const ringsCanvas = makeCanvas(1024, 1024);
    {
      const ctx = ringsCanvas.getContext('2d'), S = 1024, c = S / 2;
      ctx.strokeStyle = 'rgba(20,20,20,0.55)';
      [0.16, 0.29, 0.41, 0.48].forEach((r, i) => {
        ctx.lineWidth = i === 3 ? 3 : 1.5;
        ctx.setLineDash(i === 1 ? [8, 10] : []);
        ctx.beginPath(); ctx.arc(c, c, r * S, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.setLineDash([]);
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * Math.PI * 2, r0 = 0.48 * S, r1 = r0 - (i % 10 === 0 ? 26 : 12);
        ctx.lineWidth = i % 10 === 0 ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
        ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(c - 30, c); ctx.lineTo(c + 30, c); ctx.moveTo(c, c - 30); ctx.lineTo(c, c + 30); ctx.stroke();
      ctx.fillStyle = 'rgba(20,20,20,0.6)';
      ctx.font = '500 20px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      spaced(ctx, 4);
      ctx.fillText('RAW MIX · SAMPLE STATION 03', c, c + 0.445 * S);
    }
    const rings = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 13),
      new THREE.MeshBasicMaterial({ map: canvasTexture(ringsCanvas, true), transparent: true, opacity: 0, depthWrite: false })
    );
    rings.rotation.x = -HALF_PI;
    rings.position.set(STAGE.x, 0.006, 0.3);
    scene.add(rings);

    // contact shadows: clinker (stage 1 only), raw piles (stage 2 only), gypsum + additives (both)
    const makeBlob = () => new THREE.MeshBasicMaterial({ color: '#2a2622', alphaMap: radial, transparent: true, opacity: 0, depthWrite: false });
    const blobs = { clinker: makeBlob(), raw: makeBlob(), shared: makeBlob() };
    Object.keys(PILE).forEach((key) => {
      const p = PILE[key];
      const mat = key === 'clinker' ? blobs.clinker : key === 'gypsum' || key === 'additives' ? blobs.shared : blobs.raw;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(p.r * 2.9, p.r * 2.9), mat);
      b.rotation.x = -HALF_PI;
      b.position.set(p.x, 0.012, p.z);
      scene.add(b);
    });

    /* ---------- particles: bag → clinker / gypsum / additives → raw materials ---------- */
    const COUNT = mobile ? 7000 : 14000;
    const aStart = new Float32Array(COUNT * 3);
    const aMid = new Float32Array(COUNT * 3);
    const aEnd = new Float32Array(COUNT * 3);
    const aMidColor = new Float32Array(COUNT * 3);
    const aColor = new Float32Array(COUNT * 3);
    const aDelay = new Float32Array(COUNT);
    const aDelay2 = new Float32Array(COUNT);
    const aSize = new Float32Array(COUNT);
    const aArc = new Float32Array(COUNT);
    const aSeed = new Float32Array(COUNT);
    {
      const ca = new THREE.Color(), cb = new THREE.Color(), v = [0, 0, 0];
      const rnd = (a, b) => a + Math.random() * (b - a);
      const pickColor = (list, arr, i) => {
        if (list.length === 2) {
          ca.set(list[0]).lerp(cb.set(list[1]), Math.random());
        } else {
          ca.set(list[(Math.random() * list.length) | 0]).multiplyScalar(rnd(0.9, 1.08));
        }
        arr[i * 3] = ca.r; arr[i * 3 + 1] = ca.g; arr[i * 3 + 2] = ca.b;
      };
      const onPile = (p, arr, i) => {
        const h = p.h * (1 - Math.sqrt(Math.random()));
        const rr = p.r * (1 - h / p.h) * (0.82 + 0.18 * Math.sqrt(Math.random()));
        const a = Math.random() * Math.PI * 2;
        arr[i * 3] = p.x + Math.cos(a) * rr;
        arr[i * 3 + 1] = h + 0.03;
        arr[i * 3 + 2] = p.z + Math.sin(a) * rr;
      };
      let i = 0;
      GROUPS.forEach((g, gi) => {
        const n = gi === GROUPS.length - 1 ? COUNT - i : Math.round(COUNT * g.share);
        for (let k = 0; k < n; k++, i++) {
          let nx, ny, nz;
          if (Math.random() < 0.88) {
            nx = rnd(-1, 1); ny = rnd(-1, 1); nz = (Math.random() < 0.5 ? -1 : 1) * rnd(0.85, 1);
          } else {
            nx = Math.random() < 0.5 ? -1 : 1; ny = rnd(-1, 1); nz = rnd(-1, 1);
          }
          bagShape(nx, ny, nz, v);
          aStart[i * 3] = v[0]; aStart[i * 3 + 1] = v[1]; aStart[i * 3 + 2] = v[2];

          onPile(PILE[g.mid], aMid, i);
          if (g.end === g.mid) aEnd.set(aMid.subarray(i * 3, i * 3 + 3), i * 3);
          else onPile(PILE[g.end], aEnd, i);

          pickColor(g.colors, aColor, i);
          if (g.midColors) pickColor(g.midColors, aMidColor, i);
          else aMidColor.set(aColor.subarray(i * 3, i * 3 + 3), i * 3);

          aDelay[i] = 0.4 * (0.55 * (1 - (ny + 1) / 2) + 0.45 * Math.random());
          aDelay2[i] = 0.4 * Math.random();
          aSize[i] = rnd(0.7, 1.35);
          aArc[i] = rnd(0.6, 2.6);
          aSeed[i] = Math.random();
        }
      });
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(aEnd, 3));
    pGeo.setAttribute('aStart', new THREE.BufferAttribute(aStart, 3));
    pGeo.setAttribute('aMid', new THREE.BufferAttribute(aMid, 3));
    pGeo.setAttribute('aEnd', new THREE.BufferAttribute(aEnd, 3));
    pGeo.setAttribute('aMidColor', new THREE.BufferAttribute(aMidColor, 3));
    pGeo.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
    pGeo.setAttribute('aDelay', new THREE.BufferAttribute(aDelay, 1));
    pGeo.setAttribute('aDelay2', new THREE.BufferAttribute(aDelay2, 1));
    pGeo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
    pGeo.setAttribute('aArc', new THREE.BufferAttribute(aArc, 1));
    pGeo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));

    const uniforms = {
      uMorph: { value: 0 },
      uSplit: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 1 },
      uPR: { value: 1 },
      uBagPos: { value: new THREE.Vector3() },
      uBagRotY: { value: 0 },
      uBagScale: { value: 1 },
      uBagColor: { value: new THREE.Color('#9b968e') },
      uFogColor: { value: new THREE.Color(BG) },
      uFogNear: { value: FOG_NEAR },
      uFogFar: { value: FOG_FAR },
    };
    const particles = new THREE.Points(pGeo, new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */`
        uniform float uMorph; uniform float uSplit; uniform float uTime; uniform float uSize; uniform float uPR;
        uniform vec3 uBagPos; uniform float uBagRotY; uniform float uBagScale; uniform vec3 uBagColor;
        uniform float uFogNear; uniform float uFogFar;
        attribute vec3 aStart; attribute vec3 aMid; attribute vec3 aEnd; attribute vec3 aMidColor; attribute vec3 aColor;
        attribute float aDelay; attribute float aDelay2; attribute float aSize; attribute float aArc; attribute float aSeed;
        varying vec3 vColor; varying float vFog;
        vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
        float ease(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) * 0.5; }
        void main() {
          // stage 1: bag → clinker / gypsum / additives
          float e1 = ease(clamp((uMorph - aDelay) / 0.6, 0.0, 1.0));
          // stage 2: clinker → limestone / clay / sand / iron ore (gypsum + additives stay put)
          float e2 = ease(clamp((uSplit - aDelay2) / 0.6, 0.0, 1.0));
          float ang = aSeed * 6.2831853 + uTime * 0.7;
          vec3 start = uBagPos + rotY(aStart * uBagScale, uBagRotY);
          vec3 p = mix(start, aMid, e1);
          p += vec3(cos(ang) * 0.9, aArc, sin(ang) * 0.9) * sin(3.14159265 * e1);
          float moves = step(0.01, distance(aMid, aEnd));
          p = mix(p, aEnd, e2);
          p += vec3(cos(ang) * 0.5, aArc * 0.7, sin(ang) * 0.5) * sin(3.14159265 * e2) * moves;
          vec3 c = mix(uBagColor * (0.82 + 0.36 * aSeed), aMidColor, smoothstep(0.1, 0.8, e1));
          vColor = mix(c, aColor, smoothstep(0.1, 0.8, e2));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uSize * uPR * mix(0.55, 1.0, e1) / -mv.z;
          vFog = smoothstep(uFogNear, uFogFar, -mv.z);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uFogColor;
        varying vec3 vColor; varying float vFog;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(c, c);
          if (r2 > 1.0) discard;
          vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
          float diff = clamp(dot(n, normalize(vec3(-0.35, 0.75, 0.55))), 0.0, 1.0);
          vec3 col = vColor * (0.42 + 0.7 * diff);
          gl_FragColor = vec4(mix(col, uFogColor, vFog), 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    particles.frustumCulled = false;
    particles.visible = false;
    scene.add(particles);

    /* ---------- resize ---------- */
    let vw = 1, vh = 1;
    function resize(w, h) {
      vw = w; vh = h;
      const pr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // world-space pebble size → pixels at distance 1
      uniforms.uSize.value = (mobile ? 0.1 : 0.085) * (h / 2) / Math.tan((camera.fov * Math.PI) / 360);
      uniforms.uPR.value = pr;
    }

    /* ---------- per-frame update ---------- */
    const clamp01 = (x) => Math.min(1, Math.max(0, x));
    const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

    function update(s, dt, t) {
      camera.position.set(s.cam[0], s.cam[1], s.cam[2]);
      lookAt.set(s.tgt[0], s.tgt[1], s.tgt[2]);
      camera.lookAt(lookAt);

      const spin = dt * (0.55 + s.boost);
      millRot.rotation.x -= spin;
      pinion.rotation.x += spin * 6.8;

      // bag
      const vis = 1 - smooth(0.0, 0.05, s.morph);
      bag.visible = vis > 0.002;
      bagMats.forEach((mat) => { mat.opacity = vis; });
      bag.position.set(s.bag[0], s.bag[1] + Math.sin(t * 1.4) * 0.05 * s.idle, s.bag[2]);
      bag.rotation.set(
        s.rot[0] + Math.sin(t * 1.1) * 0.03 * s.stream,
        s.rot[1] + Math.sin(t * 0.6) * 0.12 * s.idle,
        s.rot[2] + Math.sin(t * 1.3) * 0.025 * s.stream
      );
      bag.scale.setScalar(s.scale * (1 - 0.08 * (1 - vis)));

      // belt runs only while the bag rides it
      const bx = Math.min(BELT.x1, Math.max(PACKER.x, s.bag[0]));
      beltTex.offset.x = -bx / 0.7;

      // powder stream into the hanging bag
      streamPts.visible = s.stream > 0.01;
      if (streamPts.visible) {
        streamPts.material.opacity = 0.85 * s.stream;
        const top = PACKER.spoutY, bottom = bag.position.y + BAG.h * 0.42, len = top - bottom;
        for (let i = 0; i < STREAM; i++) {
          const ph = (t * 1.7 + i / STREAM) % 1;
          const j = streamSeed[i * 2] - 0.5, k = streamSeed[i * 2 + 1] - 0.5;
          streamPos[i * 3] = PACKER.x + j * 0.06 * (1 + ph * 2);
          streamPos[i * 3 + 1] = top - ph * len;
          streamPos[i * 3 + 2] = k * 0.06 * (1 + ph * 2);
        }
        streamGeo.attributes.position.needsUpdate = true;
      }

      // dust drift
      for (let i = 0; i < DUST; i++) {
        let y = dustPos[i * 3 + 1] + dt * (0.05 + (i % 7) * 0.012);
        if (y > 8) y -= 8;
        dustPos[i * 3 + 1] = y;
      }
      dustGeo.attributes.position.needsUpdate = true;

      // particles
      particles.visible = s.morph > 0.0015;
      uniforms.uMorph.value = s.morph;
      uniforms.uSplit.value = s.split;
      uniforms.uTime.value = t;
      uniforms.uBagPos.value.copy(bag.position);
      uniforms.uBagRotY.value = bag.rotation.y;
      uniforms.uBagScale.value = s.scale;

      rings.material.opacity = 0.85 * s.rings;
      rings.visible = s.rings > 0.005;
      const settled = 0.32 * smooth(0.55, 1, s.morph);
      blobs.shared.opacity = settled;
      blobs.clinker.opacity = settled * (1 - smooth(0, 0.6, s.split));
      blobs.raw.opacity = settled * smooth(0.4, 1, s.split);
    }

    function render() {
      renderer.render(scene, camera);
    }

    const v3 = new THREE.Vector3();
    const anchors = LABEL_PILES.map((k) => ({ x: PILE[k].x, y: PILE[k].h + 0.25, z: PILE[k].z }));
    function projectPiles(out) {
      for (let i = 0; i < anchors.length; i++) {
        v3.set(anchors[i].x, anchors[i].y, anchors[i].z).project(camera);
        out[i].x = (v3.x * 0.5 + 0.5) * vw;
        out[i].y = (-v3.y * 0.5 + 0.5) * vh;
        out[i].behind = v3.z > 1;
      }
    }

    return { update, render, resize, projectPiles, fov: camera.fov, pileCount: LABEL_PILES.length };
  }

  window.CementScene = { create };
})();

import * as THREE from 'three';

export class Robot {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.camera.add(this.group);

    this.muzzleSphere = null;
    this.muzzleLight = null;
    this.gunGroup = null;
    this.leftHand = null;
    this.rightHand = null;

    this.celebrating = false;
    this.celebrationTime = 0;
    this.rainbowColors = [0xff0000, 0xff8800, 0xffff00, 0x00ff44, 0x00ffff, 0x0088ff, 0xff00ff];
    this.rainbowIdx = 0;
    this.rainbowTimer = 0;

    this.miniCelebrating = false;
    this.miniCelebTime = 0;
    this.miniCelebDuration = 0;
    this.miniCelebType = 0;

    this.swayTarget = new THREE.Vector2(0, 0);
    this.swayCurrent = new THREE.Vector2(0, 0);

    // Rest offsets for gun group relative to camera
    this.basePos = new THREE.Vector3(0.32, -0.30, -0.58);
    this.baseRot = new THREE.Euler(-0.05, 0.1, 0.02);

    // Left/right hand rest positions (local to gunGroup)
    this.leftHandBase = new THREE.Vector3(-0.06, 0.04, -0.04);
    this.rightHandBase = new THREE.Vector3(0.01, -0.09, 0.04);

    this._build();

    window.addEventListener('mousemove', (e) => {
      const nx = (e.clientX / window.innerWidth - 0.5);
      const ny = (e.clientY / window.innerHeight - 0.5);
      this.swayTarget.x = nx * 0.055;
      this.swayTarget.y = ny * -0.04;
    });
  }

  _build() {
    const metalDark = new THREE.MeshPhongMaterial({ color: 0x2a2a5a, shininess: 90, specular: 0x5555bb });
    const metalMid  = new THREE.MeshPhongMaterial({ color: 0x3d3d7a, shininess: 60 });
    const gunBody   = new THREE.MeshPhongMaterial({ color: 0x181828, shininess: 130, specular: 0x6666aa });
    const accent    = new THREE.MeshPhongMaterial({ color: 0x0077ff, emissive: 0x001a44, shininess: 120 });

    this.gunGroup = new THREE.Group();

    // ── Barrel ──
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.065, 0.38), gunBody);
    barrel.position.set(0, 0, -0.12);
    this.gunGroup.add(barrel);

    // Barrel accent stripe top
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.012, 0.32), accent);
    stripe.position.set(0, 0.038, -0.10);
    this.gunGroup.add(stripe);

    // Barrel side vents
    for (let i = 0; i < 3; i++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.025), metalMid);
      vent.position.set(0.04, 0, -0.05 - i * 0.07);
      this.gunGroup.add(vent);
      const vent2 = vent.clone();
      vent2.position.x = -0.04;
      this.gunGroup.add(vent2);
    }

    // ── Grip ──
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.15, 0.075), gunBody);
    grip.position.set(0, -0.09, 0.045);
    grip.rotation.x = 0.18;
    this.gunGroup.add(grip);

    // ── Scope / top rail ──
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.042, 0.20), metalMid);
    scope.position.set(0, 0.055, -0.08);
    this.gunGroup.add(scope);

    // ── Muzzle glow sphere ──
    const muzzleGeo = new THREE.SphereGeometry(0.058, 14, 10);
    this.muzzleSphere = new THREE.Mesh(muzzleGeo, new THREE.MeshPhongMaterial({
      color: 0xff69b4,
      emissive: 0xff69b4,
      emissiveIntensity: 0.9,
      shininess: 40,
      transparent: true,
      opacity: 0.92,
    }));
    this.muzzleSphere.position.set(0, 0, -0.315);
    this.gunGroup.add(this.muzzleSphere);

    this.muzzleLight = new THREE.PointLight(0xff69b4, 1.0, 2.0);
    this.muzzleLight.position.copy(this.muzzleSphere.position);
    this.gunGroup.add(this.muzzleLight);

    // ── Right hand (grip) ──
    this.rightHand = this._buildHand(metalDark, metalMid, false);
    this.rightHand.position.copy(this.rightHandBase);
    this.gunGroup.add(this.rightHand);

    // ── Left hand (under barrel) ──
    this.leftHand = this._buildHand(metalDark, metalMid, true);
    this.leftHand.position.copy(this.leftHandBase);
    this.gunGroup.add(this.leftHand);

    this.gunGroup.position.copy(this.basePos);
    this.gunGroup.rotation.copy(this.baseRot);
    this.group.add(this.gunGroup);
  }

  _buildHand(palmMat, fingerMat, isLeft) {
    const hand = new THREE.Group();

    // Palm
    hand.add(new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.08, 0.11), palmMat));

    // 4 fingers
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.058, 0.022), fingerMat);
      const side = isLeft ? 1 : -1;
      f.position.set((-0.036 + i * 0.024) * side, isLeft ? -0.065 : 0.065, 0.012);
      hand.add(f);
    }

    // Thumb
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.042, 0.022), fingerMat);
    thumb.position.set(isLeft ? 0.058 : -0.058, 0, 0);
    thumb.rotation.z = isLeft ? -0.35 : 0.35;
    hand.add(thumb);

    return hand;
  }

  setMuzzleColor(colorHex) {
    this.muzzleSphere.material.color.setHex(colorHex);
    this.muzzleSphere.material.emissive.setHex(colorHex);
    this.muzzleLight.color.setHex(colorHex);
  }

  getMuzzleWorldPosition() {
    const pos = new THREE.Vector3();
    this.muzzleSphere.getWorldPosition(pos);
    return pos;
  }

  startCelebration() {
    this.celebrating = true;
    this.celebrationTime = 0;
    this.rainbowIdx = 0;
    this.rainbowTimer = 0;
  }

  stopCelebration() {
    this.celebrating = false;
    this.miniCelebrating = false;
  }

  // type 0=Pump, 1=Spin, 2=Shake, 3=Raise
  startMiniCelebration(type) {
    if (this.celebrating) return;
    this.miniCelebrating = true;
    this.miniCelebTime = 0;
    this.miniCelebType = type;
    const durations = [1.5, 1.5, 1.2, 2.0];
    this.miniCelebDuration = durations[type];
  }

  update(dt) {
    this.swayCurrent.x += (this.swayTarget.x - this.swayCurrent.x) * 0.07;
    this.swayCurrent.y += (this.swayTarget.y - this.swayCurrent.y) * 0.07;

    if (this.celebrating) {
      this.celebrationTime += dt;
      const t = this.celebrationTime;

      const swing = Math.sin(t * 4.5) * 0.18;
      this.gunGroup.rotation.x = -0.42 + swing * 0.2;
      this.gunGroup.rotation.z = swing * 0.8;
      this.gunGroup.position.x = this.basePos.x + swing * 0.04;
      this.gunGroup.position.y = this.basePos.y + 0.07 + Math.abs(Math.sin(t * 4.5)) * 0.03;
      this.gunGroup.position.z = this.basePos.z;

      const spread = Math.sin(t * 3.0) * 0.025;
      this.leftHand.position.x  = this.leftHandBase.x  - spread;
      this.rightHand.position.x = this.rightHandBase.x + spread;

      this.rainbowTimer += dt;
      if (this.rainbowTimer > 0.075) {
        this.rainbowTimer = 0;
        this.rainbowIdx = (this.rainbowIdx + 1) % this.rainbowColors.length;
        const c = this.rainbowColors[this.rainbowIdx];
        this.muzzleSphere.material.color.setHex(c);
        this.muzzleSphere.material.emissive.setHex(c);
        this.muzzleLight.color.setHex(c);
      }
      return;
    }

    if (this.miniCelebrating) {
      this.miniCelebTime += dt;
      const t = this.miniCelebTime / this.miniCelebDuration;

      if (t < 1.0) {
        switch (this.miniCelebType) {
          case 0: { // Pump — gun plunges down then springs back up
            const dy = t < 0.25
              ? -(t / 0.25) * 0.14
              : t < 0.65
                ? -0.14 + ((t - 0.25) / 0.40) * 0.20
                : 0.06 * (1 - (t - 0.65) / 0.35);
            this.gunGroup.position.y = this.basePos.y + dy;
            this.gunGroup.position.x += (this.basePos.x - this.gunGroup.position.x) * 0.12;
            this.gunGroup.position.z += (this.basePos.z - this.gunGroup.position.z) * 0.12;
            this.gunGroup.rotation.x += (this.baseRot.x - this.gunGroup.rotation.x) * 0.12;
            this.gunGroup.rotation.y += (this.baseRot.y - this.gunGroup.rotation.y) * 0.12;
            this.gunGroup.rotation.z += (this.baseRot.z - this.gunGroup.rotation.z) * 0.12;
            break;
          }
          case 1: { // Spin — full Z-axis roll then back to base
            const spinProgress = t < 0.50 ? t / 0.50 : 1.0;
            const returnProgress = t > 0.50 ? (t - 0.50) / 0.50 : 0.0;
            this.gunGroup.rotation.z = this.baseRot.z + spinProgress * Math.PI * 2 * (1 - returnProgress);
            this.gunGroup.rotation.x += (this.baseRot.x - this.gunGroup.rotation.x) * 0.12;
            this.gunGroup.rotation.y += (this.baseRot.y - this.gunGroup.rotation.y) * 0.12;
            this.gunGroup.position.x += (this.basePos.x - this.gunGroup.position.x) * 0.12;
            this.gunGroup.position.y += (this.basePos.y - this.gunGroup.position.y) * 0.12;
            this.gunGroup.position.z += (this.basePos.z - this.gunGroup.position.z) * 0.12;
            break;
          }
          case 2: { // Shake — rapid left-right jitter that decays
            const decay = t < 0.7 ? 1 - t / 0.7 : 0;
            this.gunGroup.position.x = this.basePos.x + Math.sin(t * 48) * 0.065 * decay;
            this.gunGroup.position.y += (this.basePos.y - this.gunGroup.position.y) * 0.14;
            this.gunGroup.position.z += (this.basePos.z - this.gunGroup.position.z) * 0.14;
            this.gunGroup.rotation.x += (this.baseRot.x - this.gunGroup.rotation.x) * 0.14;
            this.gunGroup.rotation.y += (this.baseRot.y - this.gunGroup.rotation.y) * 0.14;
            this.gunGroup.rotation.z += (this.baseRot.z - this.gunGroup.rotation.z) * 0.14;
            break;
          }
          case 3: { // Raise — both hands and gun lift up smoothly then settle back
            const lift = t < 0.4 ? (t / 0.4) * 0.11 : (1 - (t - 0.4) / 0.6) * 0.11;
            this.gunGroup.position.y = this.basePos.y + lift;
            this.gunGroup.position.x += (this.basePos.x - this.gunGroup.position.x) * 0.10;
            this.gunGroup.position.z += (this.basePos.z - this.gunGroup.position.z) * 0.10;
            this.gunGroup.rotation.x += (this.baseRot.x - this.gunGroup.rotation.x) * 0.10;
            this.gunGroup.rotation.y += (this.baseRot.y - this.gunGroup.rotation.y) * 0.10;
            this.gunGroup.rotation.z += (this.baseRot.z - this.gunGroup.rotation.z) * 0.10;
            const handLift = t < 0.4 ? (t / 0.4) * 0.09 : (1 - (t - 0.4) / 0.6) * 0.09;
            this.leftHand.position.y  = this.leftHandBase.y  + handLift;
            this.rightHand.position.y = this.rightHandBase.y + handLift;
            break;
          }
        }
        return;
      }
      this.miniCelebrating = false;
    }

    // Smooth return to rest with mouse sway
    const targetX = this.basePos.x + this.swayCurrent.x;
    const targetY = this.basePos.y + this.swayCurrent.y;

    this.gunGroup.position.x += (targetX - this.gunGroup.position.x) * 0.10;
    this.gunGroup.position.y += (targetY - this.gunGroup.position.y) * 0.10;
    this.gunGroup.position.z += (this.basePos.z - this.gunGroup.position.z) * 0.10;

    this.gunGroup.rotation.x += (this.baseRot.x - this.gunGroup.rotation.x) * 0.10;
    this.gunGroup.rotation.y += (this.baseRot.y - this.gunGroup.rotation.y) * 0.10;
    this.gunGroup.rotation.z += (this.baseRot.z - this.gunGroup.rotation.z) * 0.10;

    this.leftHand.position.x  += (this.leftHandBase.x  - this.leftHand.position.x)  * 0.10;
    this.leftHand.position.y  += (this.leftHandBase.y  - this.leftHand.position.y)  * 0.10;
    this.rightHand.position.x += (this.rightHandBase.x - this.rightHand.position.x) * 0.10;
    this.rightHand.position.y += (this.rightHandBase.y - this.rightHand.position.y) * 0.10;
  }
}

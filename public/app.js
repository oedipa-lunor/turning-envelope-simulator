const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const SCALE = 46;
const TOP_Y = -7.8;
const BOTTOM_Y = 7.8;
const SIDE_EXTENT = 12.8;
const BRANCH_OFFSET = 4.5;
const VERTICAL_STEM_LENGTH = 14.9;
const TURN_GRID_APPROACH = 2.2;
const TURN_GRID_EXIT = 3.0;
const DT = 0.035;
const SPEED = 1.3;

const fallbackPresets = [
  { name: "Toyota Yaris", length_m: 3.94, width_m: 1.745, wheelbase_m: 2.56, front_axle_offset_m: 0.69, min_turning_radius_m: 5.1 },
  { name: "Toyota Prius", length_m: 4.54, width_m: 1.76, wheelbase_m: 2.785, front_axle_offset_m: 0.88, min_turning_radius_m: 5.4 },
  { name: "Toyota Noah", length_m: 4.695, width_m: 1.695, wheelbase_m: 2.85, front_axle_offset_m: 0.92, min_turning_radius_m: 5.4 },
  { name: "Toyota Alphard", length_m: 4.995, width_m: 1.85, wheelbase_m: 3.0, front_axle_offset_m: 0.97, min_turning_radius_m: 5.9 },
  { name: "Toyota Land Cruiser", length_m: 4.985, width_m: 1.98, wheelbase_m: 2.85, front_axle_offset_m: 1.07, min_turning_radius_m: 5.9 },
  { name: "Lexus NX", length_m: 4.66, width_m: 1.865, wheelbase_m: 2.69, front_axle_offset_m: 0.985, min_turning_radius_m: 5.6 },
  { name: "Lexus RX", length_m: 4.89, width_m: 1.92, wheelbase_m: 2.85, front_axle_offset_m: 1.05, min_turning_radius_m: 5.9 },
  { name: "Lexus LS", length_m: 5.235, width_m: 1.9, wheelbase_m: 3.125, front_axle_offset_m: 1.055, min_turning_radius_m: 5.9 }
];

const state = {
  presets: [],
  overlay: null,
  trace: null,
  anim: null,
  selectedTurnPoint: null
};

const ids = [
  "presetSelect", "vehLength", "vehWidth", "wheelbase", "frontOffset",
  "rmin", "skillMargin", "roadA", "roadB", "gridRes", "status",
  "turnLeft", "turnRight", "entryTop", "entryLeft", "entryRight", "flipVertical",
  "entryTopLabel", "entryLeftLabel", "entryRightLabel", "turnToggle", "turnLeftLabel", "turnRightLabel"
];

const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

function num(id) {
  return Number.parseFloat(el[id].value);
}

function vehicle() {
  const width = num("vehWidth");
  return {
    length: num("vehLength"),
    width,
    wheelbase: num("wheelbase"),
    frontOffset: num("frontOffset"),
    rmin: num("rmin"),
    track: Math.max(0.8, width - 0.22)
  };
}

function road() {
  return {
    verticalWidth: num("roadA"),
    horizontalWidth: num("roadB"),
    branchY: isFlipped() ? -BRANCH_OFFSET : BRANCH_OFFSET,
    angle: Math.PI / 2,
    margin: Math.max(0, num("skillMargin") || 0)
  };
}

function setStatus(text) {
  el.status.textContent = text;
}

function isFlipped() {
  return el.flipVertical.checked;
}

function selectedDirection() {
  const mode = selectedEntryMode();
  if (mode === "fromLeft") return isFlipped() ? "right" : "left";
  if (mode === "fromRight") return "right";
  return el.turnRight.checked ? "right" : "left";
}

function selectedEntryMode() {
  if (el.entryLeft.checked) return "fromLeft";
  if (el.entryRight.checked) return "fromRight";
  return "top";
}

function oppositeDirection(dir) {
  return dir === "left" ? "right" : "left";
}

function modeLabel(mode) {
  if (mode === "fromLeft") return isFlipped() ? "左から進入して右折" : "左から進入して左折";
  if (mode === "fromRight") return "右から進入して右折";
  return isFlipped() ? "下から進入" : "上から進入";
}

function worldToCanvas(x, y) {
  return [canvas.width / 2 + x * SCALE, canvas.height / 2 + y * SCALE];
}

function canvasToWorld(px, py) {
  return [(px - canvas.width / 2) / SCALE, (py - canvas.height / 2) / SCALE];
}

function normalizeAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function verticalRoadBasis() {
  const r = road();
  const u = { x: Math.cos(r.angle), y: Math.sin(r.angle) };
  const n = { x: -Math.sin(r.angle), y: Math.cos(r.angle) };
  const flipped = isFlipped();
  return {
    origin: { x: 0, y: r.branchY },
    u,
    n,
    tMin: flipped ? -r.horizontalWidth / 2 : r.horizontalWidth / 2 - VERTICAL_STEM_LENGTH,
    tMax: flipped ? -r.horizontalWidth / 2 + VERTICAL_STEM_LENGTH : r.horizontalWidth / 2
  };
}

function verticalRoadCoords(x, y) {
  const b = verticalRoadBasis();
  const dx = x - b.origin.x;
  const dy = y - b.origin.y;
  return {
    t: dx * b.u.x + dy * b.u.y,
    n: dx * b.n.x + dy * b.n.y
  };
}

function verticalRoadPoint(t, lateral = 0) {
  const b = verticalRoadBasis();
  return {
    x: b.origin.x + b.u.x * t + b.n.x * lateral,
    y: b.origin.y + b.u.y * t + b.n.y * lateral
  };
}

function samplePose(x, y, theta, steering = 0) {
  const v = vehicle();
  const rear = {
    x: x - v.wheelbase * Math.cos(theta),
    y: y - v.wheelbase * Math.sin(theta)
  };
  const h = v.track / 2;
  const left = { x: -h * Math.sin(theta), y: h * Math.cos(theta) };
  const right = { x: h * Math.sin(theta), y: -h * Math.cos(theta) };
  return {
    x,
    y,
    theta,
    steering,
    front: { x, y },
    rear,
    fl: { x: x + left.x, y: y + left.y },
    fr: { x: x + right.x, y: y + right.y },
    rl: { x: rear.x + left.x, y: rear.y + left.y },
    rr: { x: rear.x + right.x, y: rear.y + right.y }
  };
}

function carPolygon(pose) {
  const v = vehicle();
  const centerOffset = v.frontOffset - v.length / 2;
  const cx = pose.x + centerOffset * Math.cos(pose.theta);
  const cy = pose.y + centerOffset * Math.sin(pose.theta);
  const halfL = v.length / 2;
  const halfW = v.width / 2;
  return [
    [halfL, -halfW],
    [halfL, halfW],
    [-halfL, halfW],
    [-halfL, -halfW]
  ].map(([lx, ly]) => [
    cx + lx * Math.cos(pose.theta) - ly * Math.sin(pose.theta),
    cy + lx * Math.sin(pose.theta) + ly * Math.cos(pose.theta)
  ]);
}

function isPointInsideRoad(x, y) {
  const r = road();
  const vc = verticalRoadCoords(x, y);
  const b = verticalRoadBasis();
  const vertical = Math.abs(vc.n) <= r.verticalWidth / 2 - r.margin && vc.t >= b.tMin && vc.t <= b.tMax;
  const horizontal = y >= r.branchY - r.horizontalWidth / 2 + r.margin
    && y <= r.branchY + r.horizontalWidth / 2 - r.margin
    && Math.abs(x) <= SIDE_EXTENT;
  return vertical || horizontal;
}

function isPolygonInsideRoad(poly) {
  const checks = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    for (let step = 0; step <= 6; step += 1) {
      const t = step / 6;
      checks.push([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t
      ]);
    }
  }
  return checks.every(([x, y]) => isPointInsideRoad(x, y));
}

function isPoseSafe(pose) {
  return isPolygonInsideRoad(carPolygon(pose));
}

function stepPose(pose, steering) {
  const v = vehicle();
  const rearX = pose.x - v.wheelbase * Math.cos(pose.theta);
  const rearY = pose.y - v.wheelbase * Math.sin(pose.theta);
  const theta = pose.theta + (SPEED / v.wheelbase) * Math.tan(steering) * DT;
  const nextRearX = rearX + SPEED * Math.cos(pose.theta) * DT;
  const nextRearY = rearY + SPEED * Math.sin(pose.theta) * DT;
  return samplePose(
    nextRearX + v.wheelbase * Math.cos(theta),
    nextRearY + v.wheelbase * Math.sin(theta),
    theta,
    steering
  );
}

function appendStraight(traj, pose, distance, stopOnCollision) {
  const steps = Math.max(1, Math.ceil(Math.abs(distance) / (SPEED * DT)));
  let current = pose;
  for (let i = 0; i < steps; i += 1) {
    traj.push(current);
    if (!isPoseSafe(current)) return { ok: false, pose: current };
    current = stepPose(current, 0);
    if (stopOnCollision && !isPoseSafe(current)) {
      traj.push(current);
      return { ok: false, pose: current };
    }
  }
  return { ok: true, pose: current };
}

function appendExitStraight(traj, pose, distance) {
  const steps = Math.max(1, Math.ceil(Math.abs(distance) / (SPEED * DT)));
  let current = pose;
  if (!isPoseSafe(current)) {
    traj.push(current);
    return { ok: false, pose: current, reason: "exit-start-collision" };
  }

  for (let i = 0; i < steps; i += 1) {
    traj.push(current);
    const next = stepPose(current, 0);
    if (!isPoseSafe(next)) {
      return { ok: true, pose: current, reason: "left-check-area" };
    }
    current = next;
  }
  return { ok: true, pose: current, reason: "clear" };
}

function planFromTurnPoint(x, y, dir = selectedDirection(), mode = selectedEntryMode()) {
  if (mode === "fromLeft" || mode === "fromRight") return planSideFromTurnPoint(x, y, mode);
  return planTopFromTurnPoint(x, y, dir);
}

function planTopFromTurnPoint(x, y, dir) {
  const r = road();
  const v = vehicle();
  const b = verticalRoadBasis();
  const flipped = isFlipped();
  const clicked = verticalRoadCoords(x, y);
  const laneN = Math.max(
    -r.verticalWidth / 2 + v.width / 2 + r.margin,
    Math.min(r.verticalWidth / 2 - v.width / 2 - r.margin, clicked.n)
  );
  const approachHeading = flipped ? r.angle - Math.PI : r.angle;
  const startT = flipped
    ? b.tMax - (v.length - v.frontOffset) - r.margin - 0.35
    : b.tMin + (v.length - v.frontOffset) + r.margin + 0.35;
  const edgeT = flipped
    ? -r.horizontalWidth / 2 + v.width / 2 + r.margin
    : r.horizontalWidth / 2 - v.width / 2 - r.margin;
  const turnT = flipped
    ? Math.min(startT - 0.2, Math.max(edgeT, clicked.t))
    : Math.max(startT + 0.2, Math.min(edgeT, clicked.t));
  const turnPoint = verticalRoadPoint(turnT, laneN);
  const deltaMax = Math.atan(v.wheelbase / v.rmin);
  const sign = dir === "left" ? -1 : 1;
  const target = dir === "left" ? approachHeading - Math.PI / 2 : approachHeading + Math.PI / 2;
  const traj = [];
  const startPoint = verticalRoadPoint(startT, laneN);
  let pose = samplePose(startPoint.x, startPoint.y, approachHeading);

  let straight = appendStraight(traj, pose, Math.abs(turnT - startT), true);
  if (!straight.ok) return { ok: false, traj, delta: sign * deltaMax, x: turnPoint.x, y: turnPoint.y, dir, mode: "top", reason: "approach-collision" };
  pose = samplePose(turnPoint.x, turnPoint.y, approachHeading);

  let guard = 0;
  while (guard < 520 && Math.abs(normalizeAngle(pose.theta - target)) > 0.018) {
    if (!isPoseSafe(pose)) return { ok: false, traj, delta: sign * deltaMax, x: turnPoint.x, y: turnPoint.y, dir, mode: "top", reason: "turn-collision" };
    traj.push(pose);
    pose = stepPose(pose, sign * deltaMax);
    guard += 1;
  }
  if (guard >= 520) return { ok: false, traj, delta: sign * deltaMax, x: turnPoint.x, y: turnPoint.y, dir, mode: "top", reason: "turn-not-finished" };

  straight = appendExitStraight(traj, pose, 4.5);
  return { ok: straight.ok, traj, delta: sign * deltaMax, x: turnPoint.x, y: turnPoint.y, dir, mode: "top", reason: straight.reason };
}

function planSideFromTurnPoint(x, y, mode) {
  const r = road();
  const v = vehicle();
  const flipped = isFlipped();
  const dir = mode === "fromLeft" && !flipped ? "left" : "right";
  const heading = mode === "fromLeft" ? 0 : Math.PI;
  const sign = flipped
    ? (mode === "fromLeft" ? 1 : -1)
    : (mode === "fromLeft" ? -1 : 1);
  const target = flipped ? r.angle : r.angle - Math.PI;
  const startX = mode === "fromLeft"
    ? -SIDE_EXTENT + (v.length - v.frontOffset) + r.margin + 0.35
    : SIDE_EXTENT - (v.length - v.frontOffset) - r.margin - 0.35;
  const laneY = Math.max(
    r.branchY - r.horizontalWidth / 2 + v.width / 2 + r.margin,
    Math.min(r.branchY + r.horizontalWidth / 2 - v.width / 2 - r.margin, y)
  );
  const minTurnX = -r.verticalWidth / 2 - 3.0;
  const maxTurnX = r.verticalWidth / 2 + 3.0;
  const turnX = Math.max(minTurnX, Math.min(maxTurnX, x));
  const deltaMax = Math.atan(v.wheelbase / v.rmin);
  const traj = [];
  let pose = samplePose(startX, laneY, heading);

  let straight = appendStraight(traj, pose, Math.abs(turnX - startX), true);
  if (!straight.ok) return { ok: false, traj, delta: sign * deltaMax, x: turnX, y: laneY, dir, mode, reason: "approach-collision" };
  pose = samplePose(turnX, laneY, heading);

  let guard = 0;
  while (guard < 520 && Math.abs(normalizeAngle(pose.theta - target)) > 0.018) {
    if (!isPoseSafe(pose)) return { ok: false, traj, delta: sign * deltaMax, x: turnX, y: laneY, dir, mode, reason: "turn-collision" };
    traj.push(pose);
    pose = stepPose(pose, sign * deltaMax);
    guard += 1;
  }
  if (guard >= 520) return { ok: false, traj, delta: sign * deltaMax, x: turnX, y: laneY, dir, mode, reason: "turn-not-finished" };

  straight = appendExitStraight(traj, pose, 4.5);
  return { ok: straight.ok, traj, delta: sign * deltaMax, x: turnX, y: laneY, dir, mode, reason: straight.reason };
}

function classifyTurnPoint(x, y, mode = selectedEntryMode()) {
  if (mode !== "top") {
    const dir = selectedDirection();
    return planFromTurnPoint(x, y, dir, mode).ok ? (dir === "left" ? 1 : 2) : 0;
  }
  const left = planFromTurnPoint(x, y, "left", mode).ok;
  const right = planFromTurnPoint(x, y, "right", mode).ok;
  return (left ? 1 : 0) | (right ? 2 : 0);
}

function computeStartGrid() {
  stopAnimation();
  setStatus("開始可能領域を計算中...");
  const r = road();
  const v = vehicle();
  const res = Math.max(0.05, num("gridRes") || 0.25);
  const mode = selectedEntryMode();
  const selected = selectedDirection();
  const opposite = oppositeDirection(selected);
  const b = verticalRoadBasis();
  const flipped = isFlipped();
  let startN = -r.verticalWidth / 2 + v.width / 2 + r.margin;
  let endN = r.verticalWidth / 2 - v.width / 2 - r.margin;
  let startT = flipped
    ? Math.max(-r.horizontalWidth / 2 + v.width / 2 + r.margin, r.horizontalWidth / 2 - TURN_GRID_EXIT)
    : Math.max(b.tMin, -r.horizontalWidth / 2 - TURN_GRID_APPROACH);
  let endT = flipped
    ? Math.min(b.tMax, r.horizontalWidth / 2 + TURN_GRID_APPROACH)
    : Math.min(r.horizontalWidth / 2 - v.width / 2 - r.margin, -r.horizontalWidth / 2 + TURN_GRID_EXIT);
  let xmin = startN;
  let xmax = endN;
  let ymin = startT;
  let ymax = endT;

  if (mode !== "top") {
    const sideReach = r.verticalWidth / 2 + TURN_GRID_EXIT;
    xmin = mode === "fromLeft" ? -sideReach : 0;
    xmax = mode === "fromLeft" ? 0 : sideReach;
    ymin = r.branchY - r.horizontalWidth / 2 + v.width / 2 + r.margin;
    ymax = r.branchY + r.horizontalWidth / 2 - v.width / 2 - r.margin;
  }
  const cols = Math.max(2, Math.floor((xmax - xmin) / res) + 1);
  const rows = Math.max(2, Math.floor((ymax - ymin) / res) + 1);
  const cells = [];
  let left = 0;
  let right = 0;
  let both = 0;

  for (let row = 0; row < rows; row += 1) {
    const gridY = ymin + row * (ymax - ymin) / (rows - 1);
    for (let col = 0; col < cols; col += 1) {
      const gridX = xmin + col * (xmax - xmin) / (cols - 1);
      const point = mode === "top" ? verticalRoadPoint(gridY, gridX) : { x: gridX, y: gridY };
      const x = point.x;
      const y = point.y;
      const mask = classifyTurnPoint(x, y, mode);
      if (mask & 1) left += 1;
      if (mask & 2) right += 1;
      if (mask === 3) both += 1;
      cells.push({ x, y, mask });
    }
  }

  state.overlay = { cells, res, rows, cols };
  state.trace = null;
  state.selectedTurnPoint = null;
  drawScene();
  setStatus(`計算完了: ${modeLabel(mode)} / ${selected === "left" ? "左折" : "右折"} ${selected === "left" ? left : right}点 / 反対方向 ${opposite === "left" ? left : right}点 / 両方向 ${both}点。色付き領域をクリックして再生できます。`);
}

function stopAnimation() {
  if (state.anim) {
    cancelAnimationFrame(state.anim);
    state.anim = null;
  }
}

function animate(plan) {
  stopAnimation();
  state.trace = plan.traj;
  state.selectedTurnPoint = { x: plan.x, y: plan.y, ok: plan.ok };
  let index = 1;

  function frame() {
    drawScene(index);
    index += 2;
    if (index <= plan.traj.length) {
      state.anim = requestAnimationFrame(frame);
    } else {
      state.anim = null;
      drawScene(plan.traj.length);
    }
  }

  frame();
  const result = plan.ok ? "通過可能" : `途中で衝突 (${plan.reason || "unknown"})`;
  setStatus(`${result}: ${plan.dir === "left" ? "左折" : "右折"} / 曲がり始め (${plan.x.toFixed(2)}, ${plan.y.toFixed(2)}) m`);
}

function clickCanvas(ev) {
  const rect = canvas.getBoundingClientRect();
  const canvasX = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const canvasY = (ev.clientY - rect.top) * (canvas.height / rect.height);
  const [x, y] = canvasToWorld(canvasX, canvasY);
  if (!isPointInsideRoad(x, y)) {
    setStatus("道路の内側をクリックしてください。");
    return;
  }
  animate(planFromTurnPoint(x, y, selectedDirection(), selectedEntryMode()));
}

function playSample() {
  const r = road();
  const dir = selectedDirection();
  const mode = selectedEntryMode();
  const flipped = isFlipped();
  const sideSampleY = r.branchY + (flipped ? -1 : 1) * r.horizontalWidth * 0.175;
  if (mode === "fromLeft") {
    animate(planFromTurnPoint(-r.verticalWidth / 2 - 0.5, sideSampleY, dir, mode));
    return;
  }
  if (mode === "fromRight") {
    animate(planFromTurnPoint(r.verticalWidth / 2 + 0.5, sideSampleY, dir, mode));
    return;
  }
  const x = (dir === "left" ? (flipped ? 1 : -1) : (flipped ? -1 : 1)) * Math.min(0.9, r.verticalWidth / 4);
  const y = r.branchY + (flipped ? 1 : -1) * (r.horizontalWidth / 2 + 0.6);
  animate(planFromTurnPoint(x, y, dir, mode));
}

function drawScene(limit = Infinity) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawRoad();
  drawOverlay();
  drawTrace(limit);
  drawPreviewCar();
  drawLabels();
}

function drawBackground() {
  ctx.fillStyle = "#f5f6f0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(37, 48, 56, 0.08)";
  ctx.lineWidth = 1;
  for (let x = -SIDE_EXTENT; x <= SIDE_EXTENT; x += 1) {
    const [px] = worldToCanvas(x, 0);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvas.height);
    ctx.stroke();
  }
  for (let y = Math.floor(TOP_Y); y <= BOTTOM_Y; y += 1) {
    const [, py] = worldToCanvas(0, y);
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(canvas.width, py);
    ctx.stroke();
  }
}

function drawRoad() {
  const r = road();
  const [hx, hy] = worldToCanvas(-SIDE_EXTENT, r.branchY - r.horizontalWidth / 2);
  const [hx2, hy2] = worldToCanvas(SIDE_EXTENT, r.branchY + r.horizontalWidth / 2);

  ctx.fillStyle = "#d7ddd6";
  fillVerticalRoad(r.verticalWidth, "#d7ddd6");
  ctx.fillRect(hx, hy, hx2 - hx, hy2 - hy);

  ctx.strokeStyle = "#53605a";
  ctx.lineWidth = 2;
  strokeVerticalRoad(r.verticalWidth);
  strokeRectWorld(-SIDE_EXTENT, r.branchY - r.horizontalWidth / 2, SIDE_EXTENT * 2, r.horizontalWidth);

  ctx.setLineDash([14, 14]);
  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 2;
  const b = verticalRoadBasis();
  const start = verticalRoadPoint(b.tMin, 0);
  const end = verticalRoadPoint(b.tMax, 0);
  drawWorldLine(start.x, start.y, end.x, end.y);
  drawWorldLine(-SIDE_EXTENT, r.branchY, SIDE_EXTENT, r.branchY);
  ctx.setLineDash([]);

  drawEffectiveRoad();
}

function verticalRoadPolygon(width) {
  const b = verticalRoadBasis();
  const half = width / 2;
  return [
    verticalRoadPoint(b.tMin, -half),
    verticalRoadPoint(b.tMin, half),
    verticalRoadPoint(b.tMax, half),
    verticalRoadPoint(b.tMax, -half)
  ];
}

function drawWorldPolygon(points, fill, stroke) {
  ctx.beginPath();
  points.forEach((point, index) => {
    const [x, y] = worldToCanvas(point.x, point.y);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function fillVerticalRoad(width, fill) {
  drawWorldPolygon(verticalRoadPolygon(width), fill, null);
}

function strokeVerticalRoad(width) {
  drawWorldPolygon(verticalRoadPolygon(width), null, ctx.strokeStyle);
}

function drawEffectiveRoad() {
  const r = road();
  if (r.margin <= 0) return;

  ctx.save();
  ctx.setLineDash([8, 7]);
  ctx.strokeStyle = "rgba(29, 108, 141, 0.72)";
  ctx.lineWidth = 1.5;
  strokeVerticalRoad(Math.max(0, r.verticalWidth - r.margin * 2));
  strokeRectWorld(
    -SIDE_EXTENT,
    r.branchY - r.horizontalWidth / 2 + r.margin,
    SIDE_EXTENT * 2,
    Math.max(0, r.horizontalWidth - r.margin * 2)
  );
  ctx.restore();
}

function strokeRectWorld(x, y, w, h) {
  const [px, py] = worldToCanvas(x, y);
  ctx.strokeRect(px, py, w * SCALE, h * SCALE);
}

function drawWorldLine(x1, y1, x2, y2) {
  const [a, b] = worldToCanvas(x1, y1);
  const [c, d] = worldToCanvas(x2, y2);
  ctx.beginPath();
  ctx.moveTo(a, b);
  ctx.lineTo(c, d);
  ctx.stroke();
}

function drawOverlay() {
  if (!state.overlay) return;
  const { cells, res } = state.overlay;
  const selected = selectedDirection();
  const opposite = oppositeDirection(selected);
  for (const cell of cells) {
    const selectedOk = selected === "left" ? Boolean(cell.mask & 1) : Boolean(cell.mask & 2);
    const oppositeOk = opposite === "left" ? Boolean(cell.mask & 1) : Boolean(cell.mask & 2);
    if (selectedOk) ctx.fillStyle = "rgba(82, 151, 89, 0.45)";
    else if (oppositeOk) ctx.fillStyle = "rgba(222, 149, 54, 0.40)";
    else ctx.fillStyle = "rgba(207, 76, 63, 0.34)";
    const [x, y] = worldToCanvas(cell.x, cell.y);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(3, res * SCALE * 0.32), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTrace(limit) {
  if (!state.trace || state.trace.length === 0) return;
  const path = state.trace.slice(0, Math.min(limit, state.trace.length));
  drawCornerTracks(path);
  drawTrack(path, "front", "#a93632", 3);
  drawTrack(path, "rear", "#5c6670", 2);
  drawTrack(path, "fl", "#1f6fb5", 1.6);
  drawTrack(path, "fr", "#d1812c", 1.6);
  drawTrack(path, "rl", "#43a36d", 1.4);
  drawTrack(path, "rr", "#9367b2", 1.4);

  const last = path[path.length - 1];
  drawCar(last, "rgba(24, 104, 151, 0.76)", "#102f43");

  if (state.selectedTurnPoint) {
    const [x, y] = worldToCanvas(state.selectedTurnPoint.x, state.selectedTurnPoint.y);
    ctx.fillStyle = state.selectedTurnPoint.ok ? "#1f8a4c" : "#c7443e";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCornerTracks(path) {
  if (path.length < 2) return;
  const colors = [
    "rgba(120, 42, 42, 0.62)",
    "rgba(120, 42, 42, 0.62)",
    "rgba(32, 80, 86, 0.55)",
    "rgba(32, 80, 86, 0.55)"
  ];

  for (let cornerIndex = 0; cornerIndex < 4; cornerIndex += 1) {
    ctx.strokeStyle = colors[cornerIndex];
    ctx.lineWidth = cornerIndex < 2 ? 1.6 : 1.3;
    ctx.setLineDash(cornerIndex < 2 ? [] : [7, 5]);
    ctx.beginPath();
    path.forEach((pose, index) => {
      const corner = carPolygon(pose)[cornerIndex];
      const [x, y] = worldToCanvas(corner[0], corner[1]);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawPreviewCar() {
  if (state.trace && state.trace.length > 0) return;
  const r = road();
  const v = vehicle();
  if (!Number.isFinite(v.length) || !Number.isFinite(v.frontOffset)) return;
  const mode = selectedEntryMode();
  let pose;
  if (mode === "fromLeft") {
    const startX = -SIDE_EXTENT + (v.length - v.frontOffset) + r.margin + 0.35;
    pose = samplePose(startX, r.branchY, 0);
  } else if (mode === "fromRight") {
    const startX = SIDE_EXTENT - (v.length - v.frontOffset) - r.margin - 0.35;
    pose = samplePose(startX, r.branchY, Math.PI);
  } else {
    const b = verticalRoadBasis();
    const flipped = isFlipped();
    const startT = flipped
      ? b.tMax - (v.length - v.frontOffset) - r.margin - 0.35
      : b.tMin + (v.length - v.frontOffset) + r.margin + 0.35;
    const p = verticalRoadPoint(startT, 0);
    pose = samplePose(p.x, p.y, flipped ? r.angle - Math.PI : r.angle);
  }
  drawCar(pose, "rgba(55, 81, 93, 0.20)", "rgba(45, 63, 72, 0.42)");
}

function drawTrack(path, key, color, width) {
  if (path.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  path.forEach((pose, index) => {
    const [x, y] = worldToCanvas(pose[key].x, pose[key].y);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawCar(pose, fill, stroke) {
  const v = vehicle();
  const poly = carPolygon(pose).map(([x, y]) => worldToCanvas(x, y));
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  poly.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  drawFrontMarker(pose, v.frontOffset);

  drawWheel(pose.fl, pose.theta + (pose.steering || 0), "#1f6fb5");
  drawWheel(pose.fr, pose.theta + (pose.steering || 0), "#d1812c");
  drawWheel(pose.rl, pose.theta, "#43a36d");
  drawWheel(pose.rr, pose.theta, "#9367b2");

  ctx.fillStyle = "#f7fbff";
  const [fx, fy] = worldToCanvas(pose.front.x, pose.front.y);
  ctx.beginPath();
  ctx.arc(fx, fy, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawFrontMarker(pose, frontOffset) {
  const nose = {
    x: pose.front.x + frontOffset * Math.cos(pose.theta),
    y: pose.front.y + frontOffset * Math.sin(pose.theta)
  };
  const left = {
    x: nose.x - 0.28 * Math.sin(pose.theta) - 0.42 * Math.cos(pose.theta),
    y: nose.y + 0.28 * Math.cos(pose.theta) - 0.42 * Math.sin(pose.theta)
  };
  const right = {
    x: nose.x + 0.28 * Math.sin(pose.theta) - 0.42 * Math.cos(pose.theta),
    y: nose.y - 0.28 * Math.cos(pose.theta) - 0.42 * Math.sin(pose.theta)
  };
  const n = worldToCanvas(nose.x, nose.y);
  const l = worldToCanvas(left.x, left.y);
  const r = worldToCanvas(right.x, right.y);

  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.strokeStyle = "rgba(16, 47, 67, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(n[0], n[1]);
  ctx.lineTo(l[0], l[1]);
  ctx.lineTo(r[0], r[1]);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawWheel(point, theta, color) {
  const [x, y] = worldToCanvas(point.x, point.y);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(theta);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(18, 27, 32, 0.55)";
  ctx.lineWidth = 1;
  ctx.fillRect(-5, -2.2, 10, 4.4);
  ctx.strokeRect(-5, -2.2, 10, 4.4);
  ctx.restore();
}

function drawLabels() {
  ctx.fillStyle = "rgba(28, 38, 45, 0.72)";
  ctx.font = "13px system-ui, sans-serif";
  const mode = selectedEntryMode();
  const r = road();
  const b = verticalRoadBasis();
  const top = verticalRoadPoint(b.tMin, 0);
  const bottom = verticalRoadPoint(b.tMax, 0);
  const [labelX, labelY] = worldToCanvas(0, isFlipped() ? bottom.y - 0.9 : top.y + 0.9);
  ctx.fillText(modeLabel(mode), canvas.width / 2 + 12, 46);
  ctx.fillText(`縦道路幅 ${r.verticalWidth.toFixed(1)} m`, labelX + 12, labelY);
  ctx.fillText(`横道路幅 ${r.horizontalWidth.toFixed(1)} m`, 26, worldToCanvas(0, r.branchY)[1] - 12);
}

function updateModeUi() {
  const flipped = isFlipped();
  const topMode = selectedEntryMode() === "top";
  el.entryTopLabel.textContent = flipped ? "下から" : "上から";
  el.entryLeftLabel.textContent = flipped ? "左から右折" : "左から左折";
  el.entryRightLabel.textContent = "右から右折";
  el.turnToggle.classList.toggle("hidden", !topMode);

  const leftFirst = flipped;
  el.turnLeft.style.order = leftFirst ? "1" : "3";
  el.turnLeftLabel.style.order = leftFirst ? "2" : "4";
  el.turnRight.style.order = leftFirst ? "3" : "1";
  el.turnRightLabel.style.order = leftFirst ? "4" : "2";
}

function bindInputs() {
  [
    "vehLength", "vehWidth", "wheelbase", "frontOffset", "rmin",
    "skillMargin", "roadA", "roadB", "gridRes"
  ].forEach((id) => {
    el[id].addEventListener("input", () => {
      state.overlay = null;
      state.trace = null;
      state.selectedTurnPoint = null;
      drawScene();
    });
  });

  [el.turnLeft, el.turnRight].forEach((radio) => {
    radio.addEventListener("change", () => {
      state.trace = null;
      state.selectedTurnPoint = null;
      updateModeUi();
      drawScene();
      setStatus(`${modeLabel(selectedEntryMode())} / ${selectedDirection() === "left" ? "左折" : "右折"}を選択しました。計算済み領域はそのまま使えます。`);
    });
  });

  [el.entryTop, el.entryLeft, el.entryRight, el.flipVertical].forEach((control) => {
    control.addEventListener("change", () => {
      state.overlay = null;
      state.trace = null;
      state.selectedTurnPoint = null;
      updateModeUi();
      drawScene();
      setStatus(`${modeLabel(selectedEntryMode())}を選択しました。開始可能領域は再計算してください。`);
    });
  });

  updateModeUi();
}

function applyPreset(preset) {
  el.vehLength.value = preset.length_m;
  el.vehWidth.value = preset.width_m;
  el.wheelbase.value = preset.wheelbase_m;
  el.frontOffset.value = preset.front_axle_offset_m;
  el.rmin.value = preset.min_turning_radius_m;
  state.overlay = null;
  state.trace = null;
  drawScene();
}

async function loadPresets() {
  try {
    const res = await fetch("data/vehicle_presets.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.presets = await res.json();
  } catch {
    state.presets = fallbackPresets;
  }

  el.presetSelect.replaceChildren();
  state.presets.forEach((preset, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = preset.name;
    el.presetSelect.appendChild(option);
  });
  el.presetSelect.addEventListener("change", () => applyPreset(state.presets[Number(el.presetSelect.value)]));
  applyPreset(state.presets[0]);
}

document.getElementById("computeGrid").addEventListener("click", computeStartGrid);
document.getElementById("playSim").addEventListener("click", playSample);
canvas.addEventListener("click", clickCanvas);
bindInputs();
loadPresets();
drawScene();

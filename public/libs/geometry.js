// 最小限の幾何ヘルパー
const Geometry = {
  rotate: (x,y,theta)=>{
    const c=Math.cos(theta), s=Math.sin(theta);
    return [x*c - y*s, x*s + y*c];
  },
  rectCorners: (cx,cy,w,l,theta)=>{
    // cx,cy は車体中心
    const hw=w/2, hl=l/2;
    const pts=[[-hl,-hw],[-hl,hw],[hl,hw],[hl,-hw]].map(p=>{
      const r=Geometry.rotate(p[0],p[1],theta);
      return [cx + r[0], cy + r[1]];
    });
    return pts;
  }
};

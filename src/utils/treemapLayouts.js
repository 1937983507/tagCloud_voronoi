// TreeMap布局算法
// 从tagCloud_treemap项目迁移

// Strip条带算法布局
export function StripLayout(node, x0, y0, x1, y1) {
  if (!node.children) return;

  // 获取children的权重总和
  const allWeight = node.children.reduce((sum, n) => sum + (n.value || 0), 0);
  let width = x1 - x0;
  let height = y1 - y0;
  let horizontal = width > height;
  let remainingNodes = node.children.slice();
  let strip = [];
  let stripSum = 0;

  function averageAspectRatio(strip, height, width) {
    const currentWeight = strip.reduce((sum, n) => sum + n.value, 0);
    const stripwidth = height * currentWeight / allWeight;
    const AARs = [];
    let AARsum = 0;
    
    for (let i = 0; i < strip.length; i++) {
      const weighti = strip[i].value || 0;
      const ratio = weighti / currentWeight;
      const widthi = width * ratio;
      const AAR = stripwidth > widthi ? stripwidth / widthi : widthi / stripwidth;
      AARs.push(AAR);
      AARsum += AAR;
    }
    return AARsum / (strip.length);
  }

  function positionStrip(strip, x0, y0, x1, y1, horizontal) {
    const length = horizontal ? x1 - x0 : y1 - y0;
    const currentWeight = strip.reduce((sum, n) => sum + n.value, 0);
    const stripwidth = horizontal ? (height * currentWeight / allWeight) : (width * currentWeight / allWeight);
    let currentPosition = horizontal ? x0 : y0;
    
    strip.forEach(n => {
      const weighti = n.value || 0;
      const ratio = weighti / currentWeight;
      const widthi = length * ratio;

      if (horizontal) {
        n.x0 = currentPosition;
        n.y0 = y0;
        n.x1 = currentPosition + widthi;
        n.y1 = y0 + stripwidth;
        currentPosition = n.x1;
      } else {
        n.x0 = x0;
        n.y0 = currentPosition;
        n.x1 = x0 + stripwidth;
        n.y1 = currentPosition + widthi;
        currentPosition = n.y1;
      }
    });
  }

  while (remainingNodes.length) {
    const node = remainingNodes.shift();
    strip.push(node);
    stripSum += node.value;
    let currentAspectRatio = averageAspectRatio(strip, horizontal ? height : width, horizontal ? width : height);

    while (remainingNodes.length) {
      const nextNode = remainingNodes.shift();
      strip.push(nextNode);
      stripSum += nextNode.value;
      const newAspectRatio = averageAspectRatio(strip, horizontal ? height : width, horizontal ? width : height);

      if (newAspectRatio <= currentAspectRatio) {
        currentAspectRatio = newAspectRatio;
        continue;
      } else {
        strip.pop();
        stripSum -= nextNode.value;
        positionStrip(strip, x0, y0, x1, y1, horizontal);

        if (horizontal) {
          y0 += (height * stripSum / allWeight);
        } else {
          x0 += (width * stripSum / allWeight);
        }

        strip = [];
        stripSum = 0;
        remainingNodes.unshift(nextNode);
        break;
      }
    }
  }

  if (strip.length) {
    positionStrip(strip, x0, y0, x1, y1, horizontal);
  }
}

// Spiral螺旋线算法布局
export function SpiralLayout(node, x0, y0, x1, y1) {
  if (!node.children) return;

  let allWeight = node.children.reduce((sum, n) => sum + (n.value || 0), 0);
  let width = x1 - x0;
  let height = y1 - y0;
  let horizontal = true;
  let topBottonm = true;
  let remainingNodes = node.children.slice();
  let strip = [];
  let stripSum = 0;

  function averageAspectRatio(strip, heightnow, widthnow) {
    const currentWeight = strip.reduce((sum, n) => sum + n.value, 0);
    const stripwidth = heightnow * currentWeight / allWeight;
    const AARs = [];
    let AARsum = 0;
    
    for (let i = 0; i < strip.length; i++) {
      const weighti = strip[i].value || 0;
      const ratio = weighti / currentWeight;
      const widthi = widthnow * ratio;
      const AAR = stripwidth > widthi ? stripwidth / widthi : widthi / stripwidth;
      AARs.push(AAR);
      AARsum += AAR;
    }
    return AARsum / (strip.length);
  }

  function positionStrip(strip, x0, y0, x1, y1, horizontal, topBottonm) {
    const length = horizontal ? x1 - x0 : y1 - y0;
    const currentWeight = strip.reduce((sum, n) => sum + n.value, 0);
    const stripwidth = horizontal ? (height * currentWeight / allWeight) : (width * currentWeight / allWeight);

    if (horizontal && topBottonm) {
      let currentPosition = x0;
      strip.forEach(n => {
        const weighti = n.value || 0;
        const ratio = weighti / currentWeight;
        const widthi = length * ratio;
        n.x0 = currentPosition;
        n.y0 = y0;
        n.x1 = currentPosition + widthi;
        n.y1 = y0 + stripwidth;
        currentPosition = n.x1;
      });
    } else if (horizontal && !topBottonm) {
      let currentPosition = x1;
      strip.forEach(n => {
        const weighti = n.value || 0;
        const ratio = weighti / currentWeight;
        const widthi = length * ratio;
        n.x0 = currentPosition - widthi;
        n.y0 = y1 - stripwidth;
        n.x1 = currentPosition;
        n.y1 = y1;
        currentPosition = n.x0;
      });
    } else if (!horizontal && topBottonm) {
      let currentPosition = y0;
      strip.forEach(n => {
        const weighti = n.value || 0;
        const ratio = weighti / currentWeight;
        const widthi = length * ratio;
        n.x0 = x1 - stripwidth;
        n.y0 = currentPosition;
        n.x1 = x1;
        n.y1 = currentPosition + widthi;
        currentPosition = n.y1;
      });
    } else if (!horizontal && !topBottonm) {
      let currentPosition = y1;
      strip.forEach(n => {
        const weighti = n.value || 0;
        const ratio = weighti / currentWeight;
        const widthi = length * ratio;
        n.x0 = x0;
        n.y0 = currentPosition - widthi;
        n.x1 = x0 + stripwidth;
        n.y1 = currentPosition;
        currentPosition = n.y0;
      });
    }
  }

  while (remainingNodes.length) {
    const node = remainingNodes.shift();
    strip.push(node);
    stripSum += node.value;
    let currentAspectRatio = averageAspectRatio(strip, horizontal ? height : width, horizontal ? width : height);

    while (remainingNodes.length) {
      const nextNode = remainingNodes.shift();
      strip.push(nextNode);
      stripSum += nextNode.value;
      const newAspectRatio = averageAspectRatio(strip, horizontal ? height : width, horizontal ? width : height);

      if (newAspectRatio <= currentAspectRatio) {
        currentAspectRatio = newAspectRatio;
        continue;
      } else {
        strip.pop();
        stripSum -= nextNode.value;
        positionStrip(strip, x0, y0, x1, y1, horizontal, topBottonm);

        if (horizontal) {
          if (topBottonm) {
            y0 += (height * stripSum / allWeight);
            horizontal = false;
            topBottonm = true;
          } else {
            y1 -= (height * stripSum / allWeight);
            horizontal = false;
            topBottonm = false;
          }
          height -= (height * stripSum / allWeight);
        } else {
          if (topBottonm) {
            x1 -= (width * stripSum / allWeight);
            horizontal = true;
            topBottonm = false;
          } else {
            x0 += (width * stripSum / allWeight);
            horizontal = true;
            topBottonm = true;
          }
          width -= (width * stripSum / allWeight);
        }

        allWeight -= stripSum;
        strip = [];
        stripSum = 0;
        remainingNodes.unshift(nextNode);
        break;
      }
    }
  }

  if (strip.length) {
    positionStrip(strip, x0, y0, x1, y1, horizontal, topBottonm);
  }
}

// Pivot(PIV)算法布局
export function PivotLayout(node, x0, y0, x1, y1) {
  if (!node.children) return;

  const children = node.children;
  const allWeight = children.reduce((sum, n) => sum + (n.value || 0), 0);

  function recursiveLayout(nodes, x0, y0, x1, y1, totalWeight, horizontal, vertical) {
    if (nodes.length === 0) return;

    if (nodes.length === 1) {
      const n = nodes[0];
      n.x0 = x0;
      n.y0 = y0;
      n.x1 = x1;
      n.y1 = y1;
      return;
    }

    let width = x1 - x0;
    let height = y1 - y0;
    const XY = width > height;
    const midIndex = Math.floor(nodes.length / 2);
    const pivotNode = nodes[midIndex];
    let pivotWeight = pivotNode.value || 0;

    let rpwidth, rpheight;
    if (XY) {
      rpwidth = pivotWeight / totalWeight * width;
      rpheight = height;
    } else {
      rpheight = pivotWeight / totalWeight * height;
      rpwidth = width;
    }
    let AR = rpwidth > rpheight ? rpwidth / rpheight : rpheight / rpwidth;
    let dis1 = Math.abs(AR - 1);

    let leftNodes = nodes.slice(0, midIndex);
    let rightNodes = nodes.slice(midIndex + 1);
    let R1 = leftNodes;
    let R2 = [];
    let R3 = rightNodes;
    let r2Weight = 0;

    while (rightNodes.length > 1) {
      const node = rightNodes.shift();
      R2.push(node);
      r2Weight += node.value || 0;

      if (XY) {
        rpwidth = (pivotWeight + r2Weight) / totalWeight * width;
        rpheight = pivotWeight / (pivotWeight + r2Weight) * height;
      } else {
        rpheight = (pivotWeight + r2Weight) / totalWeight * height;
        rpwidth = pivotWeight / (pivotWeight + r2Weight) * width;
      }

      const tempAR = rpwidth > rpheight ? rpwidth / rpheight : rpheight / rpwidth;
      const tempDis1 = Math.abs(tempAR - 1);
      
      if (tempDis1 < dis1) {
        dis1 = tempDis1;
        continue;
      } else {
        R2.pop();
        R3.unshift(node);
        r2Weight -= node.value || 0;
        break;
      }
    }

    const R1Weight = R1.reduce((sum, n) => sum + (n.value || 0), 0);
    const R2Weight = R2.reduce((sum, n) => sum + (n.value || 0), 0);
    const R3Weight = R3.reduce((sum, n) => sum + (n.value || 0), 0);

    if (XY) {
      const R1width = R1Weight / totalWeight * width;
      const R3width = R3Weight / totalWeight * width;
      const rpwidth = (pivotWeight + R2Weight) / totalWeight * width;
      const R2width = rpwidth;
      const rpheight = pivotWeight / (pivotWeight + R2Weight) * height;
      const R2height = height - rpheight;

      if (horizontal && vertical) {
        recursiveLayout(R1, x0, y0, x0 + R1width, y1, R1Weight, true, true);
        recursiveLayout(R2, x0 + R1width, y0 + rpheight, x0 + R1width + rpwidth, y1, R2Weight, true, false);
        pivotNode.x0 = x0 + R1width;
        pivotNode.y0 = y0;
        pivotNode.x1 = x0 + R1width + rpwidth;
        pivotNode.y1 = y0 + rpheight;
        recursiveLayout(R3, x0 + R1width + rpwidth, y0, x1, y1, R3Weight, true, true);
      } else if (horizontal && !vertical) {
        recursiveLayout(R1, x0, y0, x0 + R1width, y1, R1Weight, true, false);
        pivotNode.x0 = x0 + R1width;
        pivotNode.y0 = y0 + R2height;
        pivotNode.x1 = x0 + R1width + rpwidth;
        pivotNode.y1 = y1;
        recursiveLayout(R2, x0 + R1width, y0, x0 + R1width + rpwidth, y0 + R2height, R2Weight, true, true);
        recursiveLayout(R3, x0 + R1width + rpwidth, y0, x1, y1, R3Weight, true, false);
      } else if (!horizontal && vertical) {
        recursiveLayout(R3, x0, y0, x0 + R3width, y1, R3Weight, false, true);
        pivotNode.x0 = x0 + R3width;
        pivotNode.y0 = y0;
        pivotNode.x1 = x0 + R3width + rpwidth;
        pivotNode.y1 = y0 + rpheight;
        recursiveLayout(R2, x0 + R3width, y0 + rpheight, x0 + R3width + R2width, y1, R2Weight, false, false);
        recursiveLayout(R1, x0 + R3width + R2width, y0, x1, y1, R1Weight, false, true);
      } else if (!horizontal && !vertical) {
        recursiveLayout(R3, x0, y0, x0 + R3width, y1, R3Weight, false, false);
        recursiveLayout(R2, x0 + R3width, y0, x0 + R3width + R2width, y0 + R2height, R2Weight, false, true);
        pivotNode.x0 = x0 + R3width;
        pivotNode.y0 = y0 + R2height;
        pivotNode.x1 = x0 + R3width + R2width;
        pivotNode.y1 = y1;
        recursiveLayout(R1, x0 + R3width + R2width, y0, x1, y1, R1Weight, false, false);
      }
    } else {
      const R1height = R1Weight / totalWeight * height;
      const R3height = R3Weight / totalWeight * height;
      const rpheight = (pivotWeight + R2Weight) / totalWeight * height;
      const R2height = rpheight;
      const rpwidth = pivotWeight / (pivotWeight + R2Weight) * width;
      const R2width = width - rpwidth;

      if (horizontal && vertical) {
        recursiveLayout(R3, x0, y0, x1, y0 + R3height, R3Weight, true, true);
        recursiveLayout(R2, x0, y0 + R3height, x0 + R2width, y0 + R3height + rpheight, R2Weight, false, true);
        pivotNode.x0 = x0 + R2width;
        pivotNode.y0 = y0 + R3height;
        pivotNode.x1 = x1;
        pivotNode.y1 = y0 + R3height + rpheight;
        recursiveLayout(R1, x0, y0 + R3height + R2height, x1, y1, R1Weight, true, true);
      } else if (!horizontal && !vertical) {
        recursiveLayout(R1, x0, y0, x1, y0 + R1height, R1Weight, false, false);
        pivotNode.x0 = x0;
        pivotNode.y0 = y0 + R1height;
        pivotNode.x1 = x0 + rpwidth;
        pivotNode.y1 = y0 + R1height + rpheight;
        recursiveLayout(R2, x0 + rpwidth, y0 + R1height, x1, y0 + R1height + rpheight, R2Weight, true, false);
        recursiveLayout(R3, x0, y0 + R1height + rpheight, x1, y1, R3Weight, false, false);
      } else if (horizontal && !vertical) {
        recursiveLayout(R1, x0, y0, x1, y0 + R1height, R1Weight, true, false);
        recursiveLayout(R2, x0, y0 + R1height, x0 + R2width, y0 + R1height + R2height, R2Weight, false, false);
        pivotNode.x0 = x0 + R2width;
        pivotNode.y0 = y0 + R1height;
        pivotNode.x1 = x1;
        pivotNode.y1 = y0 + R1height + rpheight;
        recursiveLayout(R3, x0, y0 + R1height + R2height, x1, y1, R3Weight, true, false);
      } else if (!horizontal && vertical) {
        recursiveLayout(R3, x0, y0, x1, y0 + R3height, R3Weight, false, true);
        pivotNode.x0 = x0;
        pivotNode.y0 = y0 + R3height;
        pivotNode.x1 = x0 + rpwidth;
        pivotNode.y1 = y0 + R3height + rpheight;
        recursiveLayout(R2, x0 + rpwidth, y0 + R3height, x1, y0 + R3height + R2height, R2Weight, true, true);
        recursiveLayout(R1, x0, y0 + R3height + rpheight, x1, y1, R1Weight, false, true);
      }
    }
  }

  let width = x1 - x0;
  let height = y1 - y0;
  const vertical = width > height;
  recursiveLayout(children, x0, y0, x1, y1, allWeight, true, vertical);
}


// 词云布局算法，基于 Jason Davies 的 d3-cloud
// 原始算法来自 Jonathan Feinberg: https://s3.amazonaws.com/static.mrfeinberg.com/bv_ch03.pdf
// 扩展功能：支持自定义形状掩码约束
// 从 d3-cloud-shape 项目迁移，转换为 ES6 模块格式

import { dispatch } from 'd3-dispatch';

const RADIANS = Math.PI / 180;

const SPIRALS = {
  archimedean: archimedeanSpiral,
  rectangular: rectangularSpiral
};

const cw = 1 << 11 >> 5;
const ch = 1 << 11;

export default function() {
  var size = [256, 256],
      text = cloudText,
      font = cloudFont,
      fontSize = cloudFontSize,
      fontStyle = cloudFontNormal,
      fontWeight = cloudFontNormal,
      rotate = cloudRotate,
      padding = cloudPadding,
      spiral = archimedeanSpiral,
      words = [],
      timeInterval = Infinity,
      event = dispatch("word", "end"),
      timer = null,
      random = Math.random,
      cloud = {},
      canvas = cloudCanvas,
      mask = null,
      maskBitmap = null;  // 掩码位图（优化：使用位操作检查）

  cloud.canvas = function(_) {
    return arguments.length ? (canvas = functor(_), cloud) : canvas;
  };

  cloud.start = function() {
    var contextAndRatio = getContext(canvas()),
        board = zeroArray((size[0] >> 5) * size[1]),
        bounds = null,
        n = words.length,
        i = -1,
        tags = [],
        data = words.map(function(d, i) {
          d.text = text.call(this, d, i);
          d.font = font.call(this, d, i);
          d.style = fontStyle.call(this, d, i);
          d.weight = fontWeight.call(this, d, i);
          d.rotate = rotate.call(this, d, i);
          d.size = ~~fontSize.call(this, d, i);
          d.padding = padding.call(this, d, i);
          return d;
        }).sort(function(a, b) { return b.size - a.size; });

    // 如果设置了掩码，转换为位图（优化：使用位操作检查）
    if (mask && mask.length > 0 && mask[0] && mask[0].length > 0) {
      var maskSize = [mask[0].length, mask.length];
      maskBitmap = convertMaskToBitmap(mask, maskSize, size);
    } else {
      maskBitmap = null;
    }

    if (timer) clearInterval(timer);
    timer = setInterval(step, 0);
    step();

    return cloud;

    function step() {
      var start = Date.now();
      while (Date.now() - start < timeInterval && ++i < n && timer) {
        var d = data[i];
        // 关键：所有单词从中心开始搜索
        // 这样大单词（先处理，已按size降序排序）会从中心开始，占据中心位置
        // 小单词（后处理）会从中心向外螺旋搜索，分布在边缘
        // 参考tagCloud_treemap2的实现：.random(() => 0.5)
        // 使用random()函数来确定初始位置，如果random()返回0.5，则初始位置正好是中心
        // 为了确保从中心开始，我们直接计算中心位置
        d.x = (size[0] * (0.5 + 0.5)) >> 1;
        d.y = (size[1] * (0.5 + 0.5)) >> 1;
        cloudSprite(contextAndRatio, d, data, i);
        if (d.hasText && place(board, d, bounds)) {
          tags.push(d);
          event.call("word", cloud, d);
          if (bounds) cloudBounds(bounds, d);
          else bounds = [{x: d.x + d.x0, y: d.y + d.y0}, {x: d.x + d.x1, y: d.y + d.y1}];
          // Temporary hack
          d.x -= size[0] >> 1;
          d.y -= size[1] >> 1;
        }
      }
      if (i >= n) {
        cloud.stop();
        event.call("end", cloud, tags, bounds);
      }
    }
  }

  cloud.stop = function() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    for (const d of words) {
      delete d.sprite;
    }
    return cloud;
  };

  function getContext(canvas) {
    const context = canvas.getContext("2d", {willReadFrequently: true});

    canvas.width = canvas.height = 1;
    const ratio = Math.sqrt(context.getImageData(0, 0, 1, 1).data.length >> 2);
    canvas.width = (cw << 5) / ratio;
    canvas.height = ch / ratio;

    context.fillStyle = context.strokeStyle = "red";

    return {context, ratio};
  }

  function place(board, tag, bounds) {
    var perimeter = [{x: 0, y: 0}, {x: size[0], y: size[1]}],
        startX = tag.x,
        startY = tag.y,
        maxDelta = Math.sqrt(size[0] * size[0] + size[1] * size[1]),
        s = spiral(size),
        // 使用random()来决定螺旋方向，如果random()返回0.5，则dt=1（从中心向外）
        // 这样确保所有单词都从中心开始向外螺旋搜索
        dt = random() < .5 ? 1 : -1,
        t = -dt,
        dxdy,
        dx,
        dy;

    while (dxdy = s(t += dt)) {
      dx = ~~dxdy[0];
      dy = ~~dxdy[1];

      if (Math.min(Math.abs(dx), Math.abs(dy)) >= maxDelta) break;

      tag.x = startX + dx;
      tag.y = startY + dy;

      if (tag.x + tag.x0 < 0 || tag.y + tag.y0 < 0 ||
          tag.x + tag.x1 > size[0] || tag.y + tag.y1 > size[1]) continue;
      // 如果提供了掩码位图，使用位操作检查掩码约束（优化版本）
      if (maskBitmap && !checkMaskBitmap(tag, maskBitmap, size[0])) continue;
      // TODO: 只在当前边界内检查碰撞
      if (!bounds || collideRects(tag, bounds)) {
        if (!cloudCollide(tag, board, size[0])) {
          var sprite = tag.sprite,
              w = tag.width >> 5,
              sw = size[0] >> 5,
              lx = tag.x - (w << 4),
              sx = lx & 0x7f,
              msx = 32 - sx,
              h = tag.y1 - tag.y0,
              x = (tag.y + tag.y0) * sw + (lx >> 5),
              last;
          for (var j = 0; j < h; j++) {
            last = 0;
            for (var i = 0; i <= w; i++) {
              board[x + i] |= (last << msx) | (i < w ? (last = sprite[j * w + i]) >>> sx : 0);
            }
            x += sw;
          }
          return true;
        }
      }
    }
    return false;
  }

  cloud.timeInterval = function(_) {
    return arguments.length ? (timeInterval = _ == null ? Infinity : _, cloud) : timeInterval;
  };

  cloud.words = function(_) {
    return arguments.length ? (words = _, cloud) : words;
  };

  cloud.size = function(_) {
    return arguments.length ? (size = [+_[0], +_[1]], cloud) : size;
  };

  cloud.font = function(_) {
    return arguments.length ? (font = functor(_), cloud) : font;
  };

  cloud.fontStyle = function(_) {
    return arguments.length ? (fontStyle = functor(_), cloud) : fontStyle;
  };

  cloud.fontWeight = function(_) {
    return arguments.length ? (fontWeight = functor(_), cloud) : fontWeight;
  };

  cloud.rotate = function(_) {
    return arguments.length ? (rotate = functor(_), cloud) : rotate;
  };

  cloud.text = function(_) {
    return arguments.length ? (text = functor(_), cloud) : text;
  };

  cloud.spiral = function(_) {
    return arguments.length ? (spiral = SPIRALS[_] || _, cloud) : spiral;
  };

  cloud.fontSize = function(_) {
    return arguments.length ? (fontSize = functor(_), cloud) : fontSize;
  };

  cloud.padding = function(_) {
    return arguments.length ? (padding = functor(_), cloud) : padding;
  };

  cloud.random = function(_) {
    return arguments.length ? (random = _, cloud) : random;
  };

  cloud.mask = function(_) {
    if (arguments.length) {
      mask = _;
      maskBitmap = null;  // 延迟转换，在 start() 时转换（需要知道 layout size）
      return cloud;
    }
    return mask;
  };

  cloud.on = function() {
    var value = event.on.apply(event, arguments);
    return value === event ? cloud : value;
  };

  return cloud;
}

function cloudText(d) {
  return d.text;
}

function cloudFont() {
  return "serif";
}

function cloudFontNormal() {
  return "normal";
}

function cloudFontSize(d) {
  return Math.sqrt(d.value);
}

function cloudRotate() {
  // 使用 Math.random，因为在实际使用中我们通常不需要自定义随机函数
  // 如果需要自定义，可以通过 cloud.random() 设置，但这里简化处理
  return (~~(Math.random() * 6) - 3) * 30;
}

function cloudPadding() {
  return 1;
}

// 获取指定文本的单色精灵位图
// 批量加载以提高速度
function cloudSprite(contextAndRatio, d, data, di) {
  if (d.sprite) return;
  var c = contextAndRatio.context,
      ratio = contextAndRatio.ratio;

  c.clearRect(0, 0, (cw << 5) / ratio, ch / ratio);
  var x = 0,
      y = 0,
      maxh = 0,
      n = data.length;
  --di;
  while (++di < n) {
    d = data[di];
    c.save();
    c.font = d.style + " " + d.weight + " " + ~~((d.size + 1) / ratio) + "px " + d.font;
    const metrics = c.measureText(d.text);
    const anchor = -Math.floor(metrics.width / 2);
    let w = (metrics.width + 1) * ratio;
    let h = d.size << 1;
    if (d.rotate) {
      var sr = Math.sin(d.rotate * RADIANS),
          cr = Math.cos(d.rotate * RADIANS),
          wcr = w * cr,
          wsr = w * sr,
          hcr = h * cr,
          hsr = h * sr;
      w = (Math.max(Math.abs(wcr + hsr), Math.abs(wcr - hsr)) + 0x1f) >> 5 << 5;
      h = ~~Math.max(Math.abs(wsr + hcr), Math.abs(wsr - hcr));
    } else {
      w = (w + 0x1f) >> 5 << 5;
    }
    if (h > maxh) maxh = h;
    if (x + w >= (cw << 5)) {
      x = 0;
      y += maxh;
      maxh = 0;
    }
    if (y + h >= ch) break;
    c.translate((x + (w >> 1)) / ratio, (y + (h >> 1)) / ratio);
    if (d.rotate) c.rotate(d.rotate * RADIANS);
    c.fillText(d.text, anchor, 0);
    if (d.padding) c.lineWidth = 2 * d.padding, c.strokeText(d.text, anchor, 0);
    c.restore();
    d.width = w;
    d.height = h;
    d.xoff = x;
    d.yoff = y;
    d.x1 = w >> 1;
    d.y1 = h >> 1;
    d.x0 = -d.x1;
    d.y0 = -d.y1;
    d.hasText = true;
    x += w;
  }
  var pixels = c.getImageData(0, 0, (cw << 5) / ratio, ch / ratio).data,
      sprite = [];
  while (--di >= 0) {
    d = data[di];
    if (!d.hasText) continue;
    var w = d.width,
        w32 = w >> 5,
        h = d.y1 - d.y0;
    // Zero the buffer
    for (var i = 0; i < h * w32; i++) sprite[i] = 0;
    x = d.xoff;
    if (x == null) return;
    y = d.yoff;
    var seen = 0,
        seenRow = -1;
    for (var j = 0; j < h; j++) {
      for (var i = 0; i < w; i++) {
        var k = w32 * j + (i >> 5),
            m = pixels[((y + j) * (cw << 5) + (x + i)) << 2] ? 1 << (31 - (i % 32)) : 0;
        sprite[k] |= m;
        seen |= m;
      }
      if (seen) seenRow = j;
      else {
        d.y0++;
        h--;
        j--;
        y++;
      }
    }
    d.y1 = d.y0 + seenRow;
    d.sprite = sprite.slice(0, (d.y1 - d.y0) * w32);
  }
}

// 使用基于掩码的碰撞检测
function cloudCollide(tag, board, sw) {
  sw >>= 5;
  var sprite = tag.sprite,
      w = tag.width >> 5,
      lx = tag.x - (w << 4),
      sx = lx & 0x7f,
      msx = 32 - sx,
      h = tag.y1 - tag.y0,
      x = (tag.y + tag.y0) * sw + (lx >> 5),
      last;
  for (var j = 0; j < h; j++) {
    last = 0;
    for (var i = 0; i <= w; i++) {
      if (((last << msx) | (i < w ? (last = sprite[j * w + i]) >>> sx : 0))
          & board[x + i]) return true;
    }
    x += sw;
  }
  return false;
}

// 将掩码二维数组转换为位图（一维数组，32位整数）
// maskArray: 二维数组 mask[y][x]，1表示允许，0表示禁止
// maskSize: [maskWidth, maskHeight]
// layoutSize: [layoutWidth, layoutHeight]
function convertMaskToBitmap(maskArray, maskSize, layoutSize) {
  if (!maskArray || maskArray.length === 0) return null;
  
  var maskWidth = maskSize[0];
  var maskHeight = maskSize[1];
  var layoutWidth = layoutSize[0];
  var layoutHeight = layoutSize[1];
  
  // 计算缩放因子（从布局坐标映射到掩码坐标）
  var scaleX = maskWidth / layoutWidth;
  var scaleY = maskHeight / layoutHeight;
  
  // 创建位图（与 board 相同格式）
  var sw = layoutWidth >> 5;  // 每行的32位字数
  var bitmap = zeroArray(sw * layoutHeight);
  
  // 将掩码转换为位图
  for (var y = 0; y < layoutHeight; y++) {
    // 映射到掩码坐标
    var maskY = Math.floor(y * scaleY);
    maskY = Math.max(0, Math.min(maskHeight - 1, maskY));
    
    for (var x = 0; x < layoutWidth; x++) {
      var maskX = Math.floor(x * scaleX);
      maskX = Math.max(0, Math.min(maskWidth - 1, maskX));
      
      // 如果掩码允许，设置对应位
      if (maskArray[maskY][maskX] === 1) {
        var bitIdx = x % 32;  // 位在32位字中的位置（0-31）
        var wordIdx = (y * sw) + (x >> 5);  // 32位字的索引
        bitmap[wordIdx] |= (1 << (31 - bitIdx));  // 设置对应位为1
      }
    }
  }
  
  return bitmap;
}

// 使用位图检查标签是否完全在掩码允许的区域内（优化版本）
// maskBitmap: 位图数组（与 board 相同格式）
// sw: 布局宽度（用于计算位图索引）
function checkMaskBitmap(tag, maskBitmap, sw) {
  if (!maskBitmap || !tag.sprite) return true;
  
  // 与 cloudCollide 类似的逻辑，但检查的是掩码位图
  sw >>= 5;
  var sprite = tag.sprite,
      w = tag.width >> 5,
      lx = tag.x - (w << 4),
      sx = lx & 0x7f,
      msx = 32 - sx,
      h = tag.y1 - tag.y0,
      x = (tag.y + tag.y0) * sw + (lx >> 5),
      last;
  
  for (var j = 0; j < h; j++) {
    last = 0;
    for (var i = 0; i <= w; i++) {
      // 计算标签的位图（与 cloudCollide 中相同）
      var tagBits = (last << msx) | (i < w ? (last = sprite[j * w + i]) >>> sx : 0);
      
      // 检查：如果 tagBits 中有位，但 maskBitmap 中对应位为0，则标签在掩码外
      // tagBits & ~maskBitmap 表示：标签有像素，但掩码不允许
      if ((tagBits & ~maskBitmap[x + i]) !== 0) {
        return false;  // 标签有像素在掩码外
      }
    }
    x += sw;
  }
  
  return true;  // 所有像素都在掩码内
}

function cloudBounds(bounds, d) {
  var b0 = bounds[0],
      b1 = bounds[1];
  if (d.x + d.x0 < b0.x) b0.x = d.x + d.x0;
  if (d.y + d.y0 < b0.y) b0.y = d.y + d.y0;
  if (d.x + d.x1 > b1.x) b1.x = d.x + d.x1;
  if (d.y + d.y1 > b1.y) b1.y = d.y + d.y1;
}

function collideRects(a, b) {
  return a.x + a.x1 > b[0].x && a.x + a.x0 < b[1].x && a.y + a.y1 > b[0].y && a.y + a.y0 < b[1].y;
}

function archimedeanSpiral(size) {
  var e = size[0] / size[1];
  return function(t) {
    return [e * (t *= .1) * Math.cos(t), t * Math.sin(t)];
  };
}

function rectangularSpiral(size) {
  var dy = 4,
      dx = dy * size[0] / size[1],
      x = 0,
      y = 0;
  return function(t) {
    var sign = t < 0 ? -1 : 1;
    // See triangular numbers: T_n = n * (n + 1) / 2.
    switch ((Math.sqrt(1 + 4 * sign * t) - sign) & 3) {
      case 0:  x += dx; break;
      case 1:  y += dy; break;
      case 2:  x -= dx; break;
      default: y -= dy; break;
    }
    return [x, y];
  };
}

// TODO: 重用数组？
function zeroArray(n) {
  var a = [],
      i = -1;
  while (++i < n) a[i] = 0;
  return a;
}

function cloudCanvas() {
  return document.createElement("canvas");
}

function functor(d) {
  return typeof d === "function" ? d : function() { return d; };
}

